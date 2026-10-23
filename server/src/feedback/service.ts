import { badRequest, HttpError } from '../utils/errors';
import type { Db } from '../items/service';

/**
 * Feedback from signed-in people. Pure parsing plus two statements, so it can be exercised against a real
 * PostgreSQL (feedback/service.pg.test.ts). Every statement is scoped to the signed-in user's id.
 */

export const FEEDBACK_CATEGORIES = ['bug', 'idea', 'privacy', 'other'] as const;
export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_MIN_LENGTH = 10;
export const FEEDBACK_MAX_LENGTH = 4000;
/** Hard cap per account per rolling 24 hours, on top of the in-memory per-hour limiter in the route. */
export const FEEDBACK_DAILY_LIMIT = 10;

export interface ParsedFeedback { category: FeedbackCategory; message: string }

export function isFeedbackCategory(v: unknown): v is FeedbackCategory {
  return typeof v === 'string' && (FEEDBACK_CATEGORIES as readonly string[]).includes(v);
}

export function parseFeedback(body: unknown): ParsedFeedback {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  if (!isFeedbackCategory(b.category)) throw badRequest('Choose a feedback category');
  if (typeof b.message !== 'string') throw badRequest('Write your feedback first');
  // Normalise line breaks and drop control characters (a NUL byte would make PostgreSQL reject the row).
  // eslint-disable-next-line no-control-regex
  const message = b.message.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (message.length === 0) throw badRequest('Write your feedback first');
  if (message.length < FEEDBACK_MIN_LENGTH) throw badRequest(`Feedback must be at least ${FEEDBACK_MIN_LENGTH} characters long`);
  if (message.length > FEEDBACK_MAX_LENGTH) throw badRequest(`Feedback must be ${FEEDBACK_MAX_LENGTH} characters or fewer`);
  return { category: b.category, message };
}

/** Stores one message. 429 when the account has already sent the daily maximum. */
export async function createFeedback(db: Db, userId: number, input: ParsedFeedback, language: string): Promise<{ id: number; createdAt: Date }> {
  const recent = await db.query("SELECT count(*)::int AS n FROM feedback WHERE user_id = $1 AND created_at > now() - interval '24 hours'", [userId]);
  if ((recent.rows[0].n as number) >= FEEDBACK_DAILY_LIMIT) {
    throw new HttpError(429, 'You have sent a lot of feedback today. Please try again tomorrow.');
  }
  const { rows } = await db.query(
    'INSERT INTO feedback (user_id, category, message, language) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
    [userId, input.category, input.message, language === 'cs' ? 'cs' : 'en']
  );
  return { id: rows[0].id as number, createdAt: rows[0].created_at as Date };
}

export async function markNotified(db: Db, id: number): Promise<void> {
  await db.query('UPDATE feedback SET notified_at = now() WHERE id = $1', [id]);
}
