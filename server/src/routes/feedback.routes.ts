import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { rateLimit } from '../utils/rateLimit';
import { createFeedback, markNotified, parseFeedback } from '../feedback/service';
import { sendFeedbackNotice } from '../email/feedbackNotice';

export const feedbackRouter = Router();

const ONE_HOUR = 60 * 60 * 1000;
/** How long the request waits for the provider before answering `notified: false` (the send itself carries on in the background). */
const NOTIFY_WAIT_MS = 5000;

// POST /api/feedback { category: 'bug' | 'idea' | 'privacy' | 'other', message }
// Mounted behind requireAuth + requireVerified. The message is stored first, so it is never lost. The answer says whether the
// operator notification was accepted by the email provider (`notified`), so the UI never implies that someone was told when nobody was.
feedbackRouter.post('/', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  rateLimit(`feedback:${userId}`, 5, ONE_HOUR);
  const input = parseFeedback(req.body);
  const saved = await createFeedback(pool, userId, input, req.lang);
  const notify = (async () => {
    try {
      const result = await sendFeedbackNotice({ id: saved.id, category: input.category, createdAt: saved.createdAt, message: input.message });
      if (!result.ok) return false;
      await markNotified(pool, saved.id);
      return true;
    } catch {
      console.error('[feedback] notification step failed');
      return false;
    }
  })();
  const notified = await Promise.race([notify, new Promise<boolean>(resolve => setTimeout(() => resolve(false), NOTIFY_WAIT_MS).unref())]);
  res.status(201).json({ id: saved.id, notified });
}));
