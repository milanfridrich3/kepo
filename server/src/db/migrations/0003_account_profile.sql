-- Adds profile-picture storage to the existing users table.
--
-- Why columns on `users` rather than a new table: a profile picture is a
-- 1:1 attribute of a user (never multi-valued), so a separate table would
-- only add a join for no benefit.
--
-- Why BYTEA in Postgres rather than a file on disk or an object-storage
-- service (S3-compatible, Cloudinary, etc.):
--   * This app's production deployment (Render web service, see README)
--     has no persistent disk attached. Anything written to the local
--     filesystem is wiped on every redeploy and restart, and would not be
--     shared across instances if the service ever scales beyond one — so
--     local-disk storage is not a reliable option here without adding a
--     paid Render Disk add-on.
--   * Adding a third-party object-storage service would introduce a new
--     paid dependency (or new external account/API keys to manage) for a
--     single, small, tightly bounded image per user — the brief is
--     explicit that this should be avoided unless actually necessary.
--   * The abuse case that normally rules out DB-stored images — large,
--     unbounded binary blobs bloating the database — does not apply here:
--     the upload endpoint (see server/src/routes/account.routes.ts)
--     decodes, resizes to at most 256x256 and re-encodes every image
--     through `sharp` before it is ever stored, so each stored avatar is
--     capped at a few tens of KB. One avatar per user, strictly bounded in
--     size, is a reasonable and explicitly justified use of BYTEA.
--   * This keeps local dev and production identical (no second storage
--     backend to configure) and keeps a clean path to move to object
--     storage later without changing the API shape: callers only ever see
--     GET /api/account/avatar, never a raw column.
--
-- All three columns are nullable with no default, so every existing user
-- row is valid immediately after this migration (no avatar = NULL), and
-- no existing data is touched.
ALTER TABLE users
  ADD COLUMN avatar_data BYTEA,
  ADD COLUMN avatar_mime TEXT,
  ADD COLUMN avatar_updated_at TIMESTAMPTZ;
