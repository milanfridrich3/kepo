# Backup and restore runbook

Everything Kepo stores, including item photos and documents, lives in **one PostgreSQL database**
(photos and documents are `BYTEA` columns, the service has no persistent disk). So one database backup
is a complete backup. This runbook is a plan to follow by hand; **none of it has been rehearsed by its author**
(no access to the production database), so rehearse the restore once before you need it.

## What is backed up where

| What | Where | Notes |
|---|---|---|
| All data | Render PostgreSQL | Check the plan: the free tier has no backups and expires; paid plans have point-in-time recovery. |
| Secrets (JWT secret, Resend key, DB URL) | Render environment | Not in the database and not in the repository. Keep a copy in a password manager. |
| Android upload key | Your password manager / offline backup | Losing it is recoverable only through Play App Signing support. See `ANDROID.md`. |
| Code | Git | |

## Take a manual backup (logical dump)

Run from any machine that can reach the database (use the **external** connection string from the Render
dashboard; never paste it into a chat, issue or file in the repository):

```bash
export DATABASE_URL='postgres://…'            # from the Render dashboard, in your shell only
pg_dump --format=custom --no-owner --file="kepo-$(date +%F).dump" "$DATABASE_URL"
unset DATABASE_URL
```

Store the dump encrypted and off the machine (it contains every person's data, hashes and photos).
Delete old dumps on a schedule that matches your privacy notice.

## Restore into a scratch database (rehearsal, safe)

```bash
createdb kepo_restore_test
pg_restore --no-owner --dbname=kepo_restore_test kepo-YYYY-MM-DD.dump
psql kepo_restore_test -c "select count(*) from users;"  -c "select count(*) from items;"
psql kepo_restore_test -c "select max(filename) from schema_migrations;"   # the newest migration in the dump
dropdb kepo_restore_test
```

Compare the counts with the dashboard. Do this after the first backup and after every large migration.

## Restore for real (disaster)

1. Stop the backend (suspend the Render service) so nothing writes during the restore.
2. Create a **new** empty database in Render (do not restore over the damaged one first).
3. `pg_restore --no-owner --dbname="$NEW_DATABASE_URL" kepo-….dump`
4. Point the backend's `DATABASE_URL` at the new database, run `npm run migrate` (a no-op when the dump is current,
   otherwise it applies the missing migrations) and start the backend.
5. Smoke test: sign in, open an item with a photo, open a document, download an export.
6. Keep the old database for a few days before deleting it.

## After a restore

- Sign-in sessions survive (the JWT secret is unchanged); accounts that changed their password after the
  backup was taken will still have their old password (their sessions are revoked by the password-change time).
- A reminder email digest already sent today may be sent again (the `reminder_log` rows are part of the backup).
- Calendar feed addresses and household invitations are restored exactly as they were.

## Deleted data and backups

Deleting an account or permanently deleting an item removes it from the live database only. It stays in any dump
you made and in Render's own backups until those are discarded or expire. Two consequences:

- Restoring a backup brings back everyone who deleted their data after it was taken. After a restore, re-apply
  deletions that were requested since the backup (keep a note of them).
- The privacy notice says copies in provider backups may remain until they expire. Check your Render plan's backup
  retention and keep your own dumps no longer than you are willing to say so.

## Per-account export

Any person can download their own data from Settings → Your data (see `DATA-EXPORT.md`). That file is **not** a
backup of the service: it has no photos, documents, saved filters or sharing settings and cannot be restored automatically.
