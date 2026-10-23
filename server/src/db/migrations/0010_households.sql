-- Households (Extension 4): people who choose to let each other SEE their items.
-- Every item still belongs to exactly one account and only that account can change
-- it; a household adds read-only visibility, nothing more. Sharing is opt-in per
-- member (`share_items`, default off).
--  * a person is in at most one household (UNIQUE user_id)
--  * invitations are single-use, expire, and only a hash of the code is stored
CREATE TABLE households (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  share_items BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
-- exactly one owner per household
CREATE UNIQUE INDEX idx_household_one_owner ON household_members(household_id) WHERE role = 'owner';

CREATE TABLE household_invites (
  id SERIAL PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_household_invites_household ON household_invites(household_id);
