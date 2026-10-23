-- Initial schema for Kepo.
-- Design notes:
--   * Plain SQL migrations (no ORM) for transparency in this first version.
--     A migration or query tool (e.g. Drizzle/Prisma) can be introduced later
--     without changing the shape of the data below.
--   * Integer primary keys are used for simplicity; can move to UUIDs later
--     if the API needs to expose non-guessable identifiers.
--   * Locations are self-referencing (parent_id) to support nesting of
--     arbitrary depth. Path strings are computed in the application layer.
--   * Items are never hard-deleted by the API — "delete" archives them
--     (archived = true) so historical data (past borrowings, moves, value)
--     is preserved.
--   * Borrowing history is kept: returning an item marks the borrowing row
--     as returned rather than deleting it, so past loans remain visible.

CREATE TYPE item_status AS ENUM (
  'with_me',
  'stored',
  'borrowed',
  'lost',
  'sold',
  'disposed'
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE locations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_locations_user ON locations(user_id);
CREATE INDEX idx_locations_parent ON locations(parent_id);

CREATE TABLE items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  photo_url TEXT,
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  status item_status NOT NULL DEFAULT 'with_me',
  purchase_date DATE,
  value NUMERIC(12,2),
  warranty_expiration DATE,
  serial_number TEXT,
  notes TEXT,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_user ON items(user_id);
CREATE INDEX idx_items_location ON items(location_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_archived ON items(archived);

-- Log of location changes, powering the "recently moved" dashboard section.
CREATE TABLE item_moves (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  from_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  to_location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_moves_item ON item_moves(item_id);

CREATE TABLE borrowings (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  borrower_name TEXT NOT NULL,
  lent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  returned BOOLEAN NOT NULL DEFAULT false,
  returned_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_borrowings_item ON borrowings(item_id);
CREATE INDEX idx_borrowings_user ON borrowings(user_id);
CREATE INDEX idx_borrowings_returned ON borrowings(returned);

-- Fixed starter category list. Users cannot create their own categories in
-- this first version (simplest reasonable choice) — that can become a
-- per-user feature later without a schema change (category_id is already a
-- normal foreign key, not an enum).
INSERT INTO categories (name) VALUES
  ('Electronics'), ('Tools'), ('Clothing'), ('Sports'), ('Books'),
  ('Accessories'), ('Household'), ('Collectibles'), ('Other')
ON CONFLICT DO NOTHING;
