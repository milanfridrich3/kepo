-- Saved filters for the item list (Extension 7). `query` holds the filter
-- the client sends to GET /api/items (validated by the API, never run as SQL).
CREATE TABLE saved_searches (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_saved_searches_user_name ON saved_searches(user_id, lower(name));
