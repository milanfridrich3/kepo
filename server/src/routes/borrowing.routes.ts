import { Router } from 'express';
import { pool } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { Borrowing } from '../types';

export const borrowingRouter = Router();

// Currently-borrowed items overview. Lending/returning itself happens via
// POST /api/items/:id/lend and /:id/return (it's an item state change),
// this endpoint is the read-side "Borrowed" list.
borrowingRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id, b.item_id, i.name AS item_name, b.borrower_name, b.lent_date,
            b.expected_return_date, b.returned, b.returned_date
     FROM borrowings b
     JOIN items i ON i.id = b.item_id
     WHERE b.user_id = $1 AND b.returned = false AND i.archived = false
     ORDER BY b.lent_date DESC, b.id DESC`,
    [req.user!.id]
  );
  const borrowings: Borrowing[] = rows.map(r => ({
    id: r.id,
    itemId: r.item_id,
    itemName: r.item_name,
    borrowerName: r.borrower_name,
    lentDate: r.lent_date,
    expectedReturnDate: r.expected_return_date,
    returned: r.returned,
    returnedDate: r.returned_date,
  }));
  res.json({ borrowings });
}));
