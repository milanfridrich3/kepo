-- Richer item details, extra photos and documents (Extensions 2 and 3).
-- Purely additive: every existing row keeps its data and gets safe defaults
-- (quantity 1, no brand/model, no tags). Nothing is rewritten or dropped.
--
--  * quantity   how many pieces this entry stands for. `value` stays the amount
--               entered for the whole entry (not per piece).
--  * brand, model  free text.
--  * tags       short labels the person chooses (a text array; normalised by the API).
--  * item_photos   extra photos beyond the primary one stored on `items`
--               (same processing as the primary: decoded, EXIF stripped, WebP).
--  * item_documents  receipts, warranty cards, manuals. Stored as BYTEA like the
--               photos (the service has no persistent disk); the API caps the
--               size and the number per item and checks the real file type.
ALTER TABLE items
  ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 9999),
  ADD COLUMN brand TEXT,
  ADD COLUMN model TEXT,
  ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_items_tags ON items USING GIN (tags);

CREATE TABLE item_photos (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_data BYTEA NOT NULL,
  image_mime TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_photos_item ON item_photos(item_id);

CREATE TYPE document_kind AS ENUM ('receipt', 'warranty', 'manual', 'other');

CREATE TABLE item_documents (
  id SERIAL PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind document_kind NOT NULL DEFAULT 'other',
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_documents_item ON item_documents(item_id);
