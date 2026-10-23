-- Adds real image upload to items, mirroring the profile-picture
-- architecture added in migration 0003 (see that file's comment for the
-- full reasoning — Render's web service has no persistent disk, so local
-- file storage isn't reliable, and adding an object-storage service is an
-- unnecessary new paid/external dependency for a bounded-size image).
--
-- The existing `photo_url` column is left untouched: it already holds a
-- plain external link for any item that has one, and continues to work as
-- a fallback in the client when an item has no uploaded `image_data`. A
-- real upload simply takes priority over that legacy link going forward —
-- nothing is migrated or deleted.
--
-- Images here are larger than an avatar (a real product photo, not a
-- cropped square icon), so the upload endpoint resizes to at most 800x800
-- (preserving aspect ratio, not cropped) and re-encodes to WebP before
-- storing — still a bounded, small-per-row amount of data, not an
-- unbounded blob.
ALTER TABLE items
  ADD COLUMN image_data BYTEA,
  ADD COLUMN image_mime TEXT,
  ADD COLUMN image_updated_at TIMESTAMPTZ;
