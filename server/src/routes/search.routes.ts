import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { mapItemRow, ITEM_SELECT } from '../db/mappers';
import { escapeLike } from '../utils/validation';

export const searchRouter = Router();

searchRouter.get('/', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  if (q.length === 0) return res.json({ items: [] });
  // Escaped so a typed % or _ is matched literally, not as a wildcard.
  const like = `%${escapeLike(q)}%`;

  // Locations whose name matches, plus every descendant of those locations,
  // so e.g. searching "Garage" also surfaces items in "Garage → Shelf 2".
  const { rows } = await pool.query(
    `WITH RECURSIVE matched_locations AS (
       SELECT id FROM locations WHERE user_id = $1 AND name ILIKE $2
     ),
     location_scope AS (
       SELECT id FROM matched_locations
       UNION
       SELECT l.id FROM locations l JOIN location_scope s ON l.parent_id = s.id
     )
     ${ITEM_SELECT}
     WHERE i.user_id = $1 AND i.archived = false AND (
       i.name ILIKE $2
       OR c.name ILIKE $2
       OR i.notes ILIKE $2
       OR i.serial_number ILIKE $2
       OR b.borrower_name ILIKE $2
       OR i.location_id IN (SELECT id FROM location_scope)
     )
     ORDER BY i.name`,
    [req.user!.id, like]
  );
  res.json({ items: rows.map(mapItemRow) });
}));
