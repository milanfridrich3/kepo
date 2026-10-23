-- Database-level backstop for "an item can only be lent to one person at
-- a time". POST /api/items/:id/lend already checks for an existing
-- unreturned borrowing before inserting a new one and returns 409 if one
-- exists; this index makes that guarantee hold even under a race (two
-- concurrent lend requests for the same item), by making the second
-- INSERT fail with a unique-violation rather than silently succeeding.
--
-- A *partial* unique index (only WHERE returned = false) is required
-- rather than a plain unique constraint on item_id, because an item can
-- legitimately have many *returned* borrowing rows in its history — only
-- one *unreturned* one at a time.
--
-- Additive-only migration: does not alter or drop anything from
-- 0001_init.sql. If this is ever run against a database that already has
-- duplicate active (returned = false) borrowings for the same item — only
-- possible if the app was used before this fix shipped — this CREATE
-- INDEX will fail until those duplicates are resolved manually; a fresh
-- database is unaffected.
CREATE UNIQUE INDEX idx_borrowings_one_active_per_item
  ON borrowings (item_id)
  WHERE returned = false;
