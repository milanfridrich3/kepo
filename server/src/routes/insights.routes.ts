import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { computeInsights } from '../insights/insights';

export const insightsRouter = Router();

// GET /api/insights: numbers from the signed-in user's own active items (see insights/insights.ts).
insightsRouter.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const [items, locations, loans, today] = await Promise.all([
    pool.query(
      `SELECT i.id, i.name, c.name AS category_name, i.status, i.location_id, i.value, i.currency,
              i.purchase_date, i.warranty_expiration
       FROM items i LEFT JOIN categories c ON c.id = i.category_id
       WHERE i.user_id = $1 AND i.archived = false`, [userId]),
    pool.query('SELECT id, name, parent_id FROM locations WHERE user_id = $1', [userId]),
    pool.query(
      `SELECT b.item_id, i.name AS item_name, b.borrower_name, b.lent_date, b.expected_return_date
       FROM borrowings b JOIN items i ON i.id = b.item_id
       WHERE b.user_id = $1 AND i.user_id = $1 AND b.returned = false AND i.archived = false`, [userId]),
    pool.query("SELECT to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD') AS today"),
  ]);
  res.json(computeInsights(
    items.rows.map(r => ({
      id: r.id, name: r.name, categoryName: r.category_name, status: r.status, locationId: r.location_id,
      value: r.value === null ? null : Number(r.value), currency: r.currency,
      purchaseDate: r.purchase_date, warrantyExpiration: r.warranty_expiration,
    })),
    locations.rows.map(r => ({ id: r.id, name: r.name, parentId: r.parent_id })),
    loans.rows.map(r => ({
      itemId: r.item_id, itemName: r.item_name, borrowerName: r.borrower_name,
      lentDate: r.lent_date, expectedReturnDate: r.expected_return_date,
    })),
    today.rows[0].today
  ));
}));
