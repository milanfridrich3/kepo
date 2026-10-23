-- One-off, idempotent data repair for loan/status inconsistencies that the
-- pre-0.2 API could produce. No schema change; it only touches rows that are
-- currently self-contradictory, and re-running it is a no-op.
--
--  1. An item was archived ("deleted") while lent: its loan stayed open, so it
--     kept appearing in Borrowed and "overdue" on the dashboard. Close those
--     loans (the history row is kept, marked returned today).
UPDATE borrowings b
   SET returned = true, returned_date = CURRENT_DATE
  FROM items i
 WHERE b.item_id = i.id AND i.archived = true AND b.returned = false;

--  2. Item says "borrowed" but has no open loan (the edit form / API could set
--     that status directly). Nothing to return and no borrower: make it
--     "with me", the same state a normal return produces.
UPDATE items i
   SET status = 'with_me', updated_at = now()
 WHERE i.status = 'borrowed'
   AND NOT EXISTS (SELECT 1 FROM borrowings b WHERE b.item_id = i.id AND b.returned = false);

--  3. Open loan on an active item whose status was then edited away from
--     "borrowed". Only the two neutral statuses are corrected; lost/sold/
--     disposed are left alone because they may be deliberate.
UPDATE items i
   SET status = 'borrowed', updated_at = now()
 WHERE i.archived = false
   AND i.status IN ('with_me', 'stored')
   AND EXISTS (SELECT 1 FROM borrowings b WHERE b.item_id = i.id AND b.returned = false);
