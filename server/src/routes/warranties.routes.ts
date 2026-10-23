import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { mapItemRow, ITEM_SELECT } from '../db/mappers';
import { WarrantyBuckets } from '../types';
import { daysUntil } from '../utils/dates';

export const warrantiesRouter = Router();

warrantiesRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `${ITEM_SELECT}
     WHERE i.user_id = $1 AND i.archived = false AND i.warranty_expiration IS NOT NULL
     ORDER BY i.warranty_expiration ASC`,
    [req.user!.id]
  );
  const items = rows.map(mapItemRow);

  const buckets: WarrantyBuckets = { active: [], expiringSoon: [], expired: [] };
  for (const item of items) {
    const days = daysUntil(item.warrantyExpiration!);
    if (days < 0) buckets.expired.push(item);
    else if (days <= 30) buckets.expiringSoon.push(item);
    else buckets.active.push(item);
  }
  res.json(buckets);
}));
