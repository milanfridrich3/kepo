import { Router } from 'express';
import { pool, withTransaction } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { rateLimit } from '../utils/rateLimit';
import { badRequest } from '../utils/errors';
import * as hh from '../household/service';

export const householdRouter = Router();
const FIFTEEN_MIN = 15 * 60 * 1000;
const id = (raw: string) => { const n = Number(raw); if (!Number.isInteger(n) || n < 1) throw badRequest('Invalid id'); return n; };

householdRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ household: await hh.getHousehold(pool, req.user!.id) });
}));

householdRouter.post('/', asyncHandler(async (req, res) => {
  await withTransaction(c => hh.createHousehold(c, req.user!.id, req.body?.name));
  res.status(201).json({ household: await hh.getHousehold(pool, req.user!.id) });
}));

householdRouter.delete('/', asyncHandler(async (req, res) => {
  await withTransaction(c => hh.deleteHousehold(c, req.user!.id));
  res.status(204).end();
}));

householdRouter.post('/invites', asyncHandler(async (req, res) => {
  rateLimit(`household-invite:${req.user!.id}`, 20, FIFTEEN_MIN);
  const invite = await withTransaction(c => hh.createInvite(c, req.user!.id));
  res.status(201).json(invite); // the only time the code is visible
}));

householdRouter.delete('/invites/:id', asyncHandler(async (req, res) => {
  await withTransaction(c => hh.revokeInvite(c, req.user!.id, id(req.params.id)));
  res.status(204).end();
}));

// Joining is rate-limited per account so codes cannot be guessed (31^10 combinations, 7-day lifetime).
householdRouter.post('/join', asyncHandler(async (req, res) => {
  rateLimit(`household-join:${req.user!.id}`, 10, FIFTEEN_MIN);
  await withTransaction(c => hh.joinHousehold(c, req.user!.id, req.body?.code));
  res.json({ household: await hh.getHousehold(pool, req.user!.id) });
}));

householdRouter.post('/leave', asyncHandler(async (req, res) => {
  await withTransaction(c => hh.leaveHousehold(c, req.user!.id));
  res.status(204).end();
}));

householdRouter.delete('/members/:userId', asyncHandler(async (req, res) => {
  await withTransaction(c => hh.removeMember(c, req.user!.id, id(req.params.userId)));
  res.status(204).end();
}));

householdRouter.put('/sharing', asyncHandler(async (req, res) => {
  if (typeof req.body?.shareItems !== 'boolean') throw badRequest('Sharing setting must be true or false');
  await hh.setSharing(pool, req.user!.id, req.body.shareItems);
  res.json({ household: await hh.getHousehold(pool, req.user!.id) });
}));

householdRouter.get('/items', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json({ items: await hh.sharedItems(pool, req.user!.id, q) });
}));
