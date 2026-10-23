import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';

export const categoriesRouter = Router();

// Categories are a fixed, shared (not per-user) list in this first version.
categoriesRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT id, name FROM categories ORDER BY name');
  res.json({ categories: rows });
}));
