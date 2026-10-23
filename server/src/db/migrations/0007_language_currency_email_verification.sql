-- Language + currency preferences, per-item currency, email verification and
-- password-recovery codes.
--
-- Everything here is additive and safe for existing data and for the previous
-- application version that may still be serving requests while this runs:
-- every new column is nullable or has a default, and nothing is dropped,
-- renamed or rewritten except the two deliberate back-fills described below.
--
-- 1. Preferences on users.
--    * language: defaults to 'en' (English is the default for everyone).
--    * currency: defaults to 'CZK' for rows that already exist, because the
--      application has only ever shown amounts as "Kč" — an existing user's
--      working currency is therefore koruna. New accounts get their currency
--      from the application at registration (cs -> CZK, en -> EUR), not from
--      this column default.
--
-- 2. Currency of each stored amount (items.currency).
--    items.value was always a bare NUMERIC; the UI labelled it "Kč". Existing
--    amounts are therefore CZK, which is what the DEFAULT records for every
--    existing row. Currency is stored per item so that switching the account
--    currency later NEVER reinterprets or converts an existing amount: each
--    item keeps (and is displayed in) the currency it was entered in.
--
-- 3. Email verification.
--    email_verified_at is NULL for unverified addresses. Accounts that already
--    exist are marked verified at their creation time (grandfathered): they
--    were working accounts before verification existed, and locking them out
--    until they receive a code would be a regression. Only accounts created
--    after this migration must verify.
--
-- 4. auth_codes: one table for both one-time email codes and reset tokens.
--    Only a keyed hash (HMAC-SHA256) of the secret is stored, never the secret.

ALTER TABLE users
  ADD COLUMN language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'cs')),
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR', 'USD', 'GBP')),
  ADD COLUMN email_verified_at TIMESTAMPTZ;

UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

ALTER TABLE items
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'CZK' CHECK (currency IN ('CZK', 'EUR', 'USD', 'GBP'));

CREATE TABLE auth_codes (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  -- HMAC-SHA256 (hex) of the code/token; the secret itself is never stored.
  secret_hash TEXT NOT NULL,
  -- The address the message was sent to. A code stops working if the account's
  -- email has changed since, so it cannot confirm a different address.
  target_email TEXT NOT NULL,
  attempts SMALLINT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  -- Set once the code is used, replaced by a newer one, or otherwise retired.
  consumed_at TIMESTAMPTZ,
  -- Set only after the email provider accepted the message; drives the resend
  -- cooldown, so a failed delivery never makes the user wait.
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_auth_codes_secret_hash ON auth_codes(secret_hash);
CREATE INDEX idx_auth_codes_active ON auth_codes(user_id, purpose) WHERE consumed_at IS NULL;
