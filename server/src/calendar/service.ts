import crypto from 'node:crypto';
import type { Db } from '../items/service';
import type { Language } from '../types';
import { buildIcs } from './ics';
import type { CalendarEvent } from './ics';

/**
 * Read-only calendar feed. The address contains a random secret token; only its SHA-256 hash is
 * stored (users.calendar_token_hash), so the token cannot be recovered and is shown once, when it
 * is created. Creating a new token replaces the old one; revoking switches the feed off.
 * Anyone who has the address can read the dates and item names in it: treat it like a password.
 */

export const MAX_EVENTS = 1000;
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export async function rotateToken(db: Db, userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url'); // 43 chars
  await db.query('UPDATE users SET calendar_token_hash = $2 WHERE id = $1', [userId, hashToken(token)]);
  return token;
}

export async function revokeToken(db: Db, userId: number): Promise<void> {
  await db.query('UPDATE users SET calendar_token_hash = NULL WHERE id = $1', [userId]);
}

export async function feedEnabled(db: Db, userId: number): Promise<boolean> {
  const { rows } = await db.query('SELECT calendar_token_hash IS NOT NULL AS on FROM users WHERE id = $1', [userId]);
  return rows.length > 0 && rows[0].on === true;
}

const T = {
  en: { warranty: (n: string) => `Warranty ends: ${n}`, due: (n: string) => `Return due: ${n}`, name: 'Kepo' },
  cs: { warranty: (n: string) => `Konec záruky: ${n}`, due: (n: string) => `Vrátit do: ${n}`, name: 'Kepo' },
} as const;

/** The ICS for the token's owner, or null when the token matches no account. */
export async function feedForToken(db: Db, token: string, now: Date = new Date()): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const u = await db.query('SELECT id, language FROM users WHERE calendar_token_hash = $1 AND email_verified_at IS NOT NULL', [hashToken(token)]);
  if (u.rows.length === 0) return null;
  const userId = u.rows[0].id as number;
  const lang: Language = u.rows[0].language === 'cs' ? 'cs' : 'en';
  const t = T[lang];
  // Sequential: a Db may be a single connection.
  const items = await db.query(
    `SELECT id, name, to_char(warranty_expiration, 'YYYY-MM-DD') AS d FROM items
      WHERE user_id = $1 AND archived = false AND warranty_expiration >= (now() AT TIME ZONE 'UTC')::date - 30
      ORDER BY warranty_expiration, id LIMIT $2`, [userId, MAX_EVENTS]);
  const loans = await db.query(
    `SELECT b.id, i.name, to_char(b.expected_return_date, 'YYYY-MM-DD') AS d
       FROM borrowings b JOIN items i ON i.id = b.item_id
      WHERE b.user_id = $1 AND i.user_id = $1 AND b.returned = false AND i.archived = false AND b.expected_return_date IS NOT NULL
      ORDER BY b.expected_return_date, b.id LIMIT $2`, [userId, MAX_EVENTS]);
  const events: CalendarEvent[] = [
    ...items.rows.map(r => ({ uid: `warranty-${r.id}-${r.d}@kepo`, date: r.d as string, summary: t.warranty(r.name) })),
    ...loans.rows.map(r => ({ uid: `loan-${r.id}@kepo`, date: r.d as string, summary: t.due(r.name) })),
  ].slice(0, MAX_EVENTS);
  return buildIcs(events, t.name, now);
}
