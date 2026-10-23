import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { rateLimit } from '../utils/rateLimit';
import { feedEnabled, feedForToken, revokeToken, rotateToken } from '../calendar/service';

/** Signed-in management of the feed (mounted behind requireAuth). */
export const calendarSettingsRouter = Router();

calendarSettingsRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ enabled: await feedEnabled(pool, req.user!.id) });
}));

// Creates (or replaces) the secret address. The token is returned once and never stored in clear.
calendarSettingsRouter.post('/', asyncHandler(async (req, res) => {
  rateLimit(`calendar-rotate:${req.user!.id}`, 10, 15 * 60 * 1000);
  res.status(201).json({ enabled: true, token: await rotateToken(pool, req.user!.id) });
}));

calendarSettingsRouter.delete('/', asyncHandler(async (req, res) => {
  await revokeToken(pool, req.user!.id);
  res.status(204).end();
}));

/** Public feed for calendar apps; the secret in the path is the only credential (mounted WITHOUT requireAuth). */
export const calendarFeedRouter = Router();

calendarFeedRouter.get('/:token.ics', asyncHandler(async (req, res) => {
  rateLimit(`calendar-feed:${req.ip}`, 120, 15 * 60 * 1000);
  const ics = await feedForToken(pool, req.params.token);
  if (ics === null) { res.status(404).type('text/plain').send('Not found'); return; }
  res.set({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Content-Disposition': 'inline; filename="kepo.ics"' });
  res.type('text/calendar; charset=utf-8').send(ics);
}));
