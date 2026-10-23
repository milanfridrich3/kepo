import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { mapItemRow, ITEM_SELECT } from '../db/mappers';
import { DashboardData, AttentionItem } from '../types';
import { daysUntil } from '../utils/dates';
import { buildPathResolver } from '../utils/locationPath';

export const dashboardRouter = Router();

dashboardRouter.get('/', asyncHandler(async (req, res) => {
  const userId = req.user!.id;

  const [
    totalItemsResult,
    totalLocationsResult,
    borrowedResult,
    recentlyAddedResult,
    recentlyMovedResult,
    overdueResult,
    expiringSoonResult,
    locationsResult,
  ] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM items WHERE user_id = $1 AND archived = false', [userId]),
    pool.query('SELECT COUNT(*)::int AS count FROM locations WHERE user_id = $1', [userId]),
    pool.query("SELECT COUNT(*)::int AS count FROM items WHERE user_id = $1 AND status = 'borrowed' AND archived = false", [userId]),
    pool.query(`${ITEM_SELECT} WHERE i.user_id = $1 AND i.archived = false ORDER BY i.created_at DESC, i.id DESC LIMIT 5`, [userId]),
    pool.query(
      `SELECT m.id, m.item_id, i.name AS item_name, m.from_location_id, m.to_location_id, m.moved_at
       FROM item_moves m JOIN items i ON i.id = m.item_id
       WHERE i.user_id = $1 AND i.archived = false ORDER BY m.moved_at DESC, m.id DESC LIMIT 5`,
      [userId]
    ),
    pool.query(
      `SELECT b.item_id, i.name AS item_name, b.borrower_name, b.expected_return_date
       FROM borrowings b JOIN items i ON i.id = b.item_id
       WHERE b.user_id = $1 AND b.returned = false AND i.archived = false AND b.expected_return_date IS NOT NULL
         AND b.expected_return_date < CURRENT_DATE`,
      [userId]
    ),
    pool.query(
      `SELECT id, name, warranty_expiration FROM items
       WHERE user_id = $1 AND archived = false AND warranty_expiration IS NOT NULL
         AND warranty_expiration >= CURRENT_DATE
         AND warranty_expiration <= CURRENT_DATE + INTERVAL '30 days'`,
      [userId]
    ),
    pool.query('SELECT id, name, parent_id FROM locations WHERE user_id = $1', [userId]),
  ]);

  const resolvePath = buildPathResolver(locationsResult.rows);

  const attention: AttentionItem[] = [
    ...overdueResult.rows.map(r => ({
      type: 'overdue' as const,
      itemId: r.item_id,
      itemName: r.item_name,
      borrowerName: r.borrower_name,
      message: `${r.item_name} is overdue from ${r.borrower_name}`,
    })),
    ...expiringSoonResult.rows.map(r => {
      const days = daysUntil(r.warranty_expiration);
      return {
        type: 'warranty' as const,
        itemId: r.id,
        itemName: r.name,
        days,
        message: `${r.name} warranty expires in ${days} day${days === 1 ? '' : 's'}`,
      };
    }),
  ];

  const data: DashboardData = {
    totalItems: totalItemsResult.rows[0].count,
    totalLocations: totalLocationsResult.rows[0].count,
    borrowedCount: borrowedResult.rows[0].count,
    warrantiesExpiringSoonCount: expiringSoonResult.rows.length,
    recentlyAdded: recentlyAddedResult.rows.map(mapItemRow),
    recentlyMoved: recentlyMovedResult.rows.map(r => ({
      id: r.id,
      itemId: r.item_id,
      itemName: r.item_name,
      fromPath: resolvePath(r.from_location_id),
      toPath: resolvePath(r.to_location_id),
      fromLocationId: r.from_location_id,
      toLocationId: r.to_location_id,
      movedAt: r.moved_at,
    })),
    attention,
  };

  res.json(data);
}));
