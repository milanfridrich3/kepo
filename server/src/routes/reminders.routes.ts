import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { remindersFor } from '../reminders/service';
import { utcDay } from '../reminders/job';

export const remindersRouter = Router();

// GET /api/reminders: warranties ending within 30 days, loans overdue or due within 3 days.
remindersRouter.get('/', asyncHandler(async (req, res) => {
  res.json({ reminders: await remindersFor(pool, req.user!.id, utcDay(new Date())) });
}));
