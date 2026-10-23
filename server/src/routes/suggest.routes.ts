import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { suggestCategory } from '../suggest/category';

export const suggestRouter = Router();

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);

// GET /api/suggest/category?name=&brand=&model=  → keyword-based suggestion, not AI. Nothing is stored.
suggestRouter.get('/category', asyncHandler(async (req, res) => {
  const s = suggestCategory({ name: str(req.query.name, 200), brand: str(req.query.brand, 100), model: str(req.query.model, 100) });
  if (!s) { res.json({ suggestion: null }); return; }
  const { rows } = await pool.query('SELECT id FROM categories WHERE name = $1', [s.category]);
  res.json({ suggestion: rows.length ? { categoryId: rows[0].id, name: s.category, matched: s.matched } : null });
}));
