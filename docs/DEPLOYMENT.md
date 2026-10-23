# Deployment: four separate Render services

Kepo runs as **four independent services**. None of them imports, builds or
serves another one's code.

| # | Service | Type | Root directory | Public address |
|---|---------|------|----------------|----------------|
| 1 | Database | Render PostgreSQL | – | internal only |
| 2 | Backend (API) | Web Service (Node) | repository root | the existing API URL (`https://where-is-it-api.onrender.com`, or your own, e.g. `https://api.kepo.is-cool.dev`) |
| 3 | Frontend (the app) | Static Site | `client` | `https://app.kepo.is-cool.dev` |
| 4 | Landing page | Static Site | `landing-page` | `https://kepo.is-cool.dev` |

Rules that must keep holding:

- `https://kepo.is-cool.dev` serves **only** the landing page.
- `https://app.kepo.is-cool.dev` serves **only** the app. Its `/` is the signed-in
  dashboard (signed-out visitors are sent to `/login`); it has no landing page.
- The landing page links to `https://app.kepo.is-cool.dev/register` and
  `/login`. It has no JavaScript, no build dependency and no environment variables.
- The app build does not import anything from `landing-page/`, and the landing
  page does not import anything from `client/`.

This repository contains no DNS or Render configuration. Everything below is a
**manual step** you perform in the Render dashboard and at your DNS provider;
nothing here has been applied or verified from this repository.

## 1. Database

Render PostgreSQL. Copy its *Internal Database URL* for the backend's `DATABASE_URL`.

## 2. Backend (Web Service)

| Setting | Value |
|---|---|
| Root Directory | *(empty, repository root)* |
| Build Command | `npm install && npm run build:server` |
| Start Command | `npm run migrate && npm start` (or run `npm run migrate` as a Render pre-deploy command) |
| Health Check Path | `/api/health` |

Environment variables (all server-side; see `server/.env.example`):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | from the database service |
| `JWT_SECRET` | long random string (32+ chars) |
| `CLIENT_ORIGIN` | `https://app.kepo.is-cool.dev` (CORS + CSRF origin check; also the base of links in emails) |
| `RESEND_API_KEY` | your Resend key, **secret**, only here |
| `EMAIL_FROM` | e.g. `Kepo <no-reply@kepo.is-cool.dev>` (domain must be verified in Resend, see [EMAIL.md](EMAIL.md)) |
| `EMAIL_REPLY_TO` | optional; becomes the Reply-To of every email Kepo sends, so only use an address you are happy to show to all users |
| `FEEDBACK_NOTIFY_EMAIL` | **recommended / required for release**: your private mailbox for feedback notifications (secret, server-only). See [FEEDBACK.md](FEEDBACK.md) |
| `APP_URL` | optional; defaults to `CLIENT_ORIGIN` |
| `LANDING_URL` | optional; default `https://kepo.is-cool.dev` (hosts the logo in emails) |

Migration `0007` is additive and safe on a live database (see "Migration" below).
Cookies: the app and API are on different sites unless you put the API on
`api.kepo.is-cool.dev`; that is strongly recommended (same site, so the
`SameSite=None` third-party-cookie problem described in docs/ANDROID.md disappears).

## 3. Frontend (Static Site)

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Build Command | `npm install --include=dev && npm run build` (run from the workspace root if your lockfile lives there: Root Directory = repository root, build `npm install && npm run build:client`, publish `client/dist`) |
| Publish Directory | `dist` (or `client/dist` if the root is the repository root) |
| Environment | `VITE_API_URL=https://<your API host>/api` (or create `client/.env.production` from `client/.env.example`; it contains no secret) |
| Redirects/Rewrites | **Required:** `/*` → `/index.html`, action **Rewrite** (the app is a single-page app: `/verify-email`, `/reset-password?token=…`, `/items/5` must not 404) |
| Custom domain | `app.kepo.is-cool.dev` |

The reset-password link in emails is `https://app.kepo.is-cool.dev/reset-password?token=…`,
so the rewrite rule is what makes password recovery work.

## 4. Landing page (Static Site)

See `landing-page/README.md`: Root Directory `landing-page`, Build `npm run build`,
Publish `dist`, no environment variables, no rewrite, custom domain `kepo.is-cool.dev`.

## DNS (manual)

| Name | Points to |
|---|---|
| `kepo.is-cool.dev` | landing-page static site (as Render instructs) |
| `app.kepo.is-cool.dev` | frontend static site |
| `api.kepo.is-cool.dev` *(optional)* | backend web service |
| Resend records | SPF / DKIM / DMARC for the sending domain, see [EMAIL.md](EMAIL.md) |

## Migration 0007 (language, currency, verification)

`server/src/db/migrations/0007_language_currency_email_verification.sql`:

- adds `users.language` (default `en`), `users.currency` (default `CZK` for rows that already exist), `users.email_verified_at`;
- marks every **existing** user as verified (they were working accounts before verification existed);
- adds `items.currency` (default `CZK`: every existing amount was displayed as "Kč", so it keeps meaning koruna and is **never converted**);
- creates `auth_codes` (hashed one-time codes and reset tokens).

Nothing is dropped or rewritten. The previous application version keeps working
against the migrated schema (new columns are defaulted), so the migration can run
before the new backend starts. There is no rollback script; a rollback would be
`DROP TABLE auth_codes` plus dropping the four new columns.

## Order of a first release

1. Create the Resend account, add and verify the sending domain, create an API key (see EMAIL.md).
2. Set the backend variables, deploy the backend (runs the migration).
3. Deploy the frontend with the rewrite rule and `VITE_API_URL`.
4. Deploy the landing page and point `kepo.is-cool.dev` at it.
5. Smoke test: register, receive the code, verify, sign out, "Forgot password?", reset.

## Migrations 0008 to 0011 (item details, files, saved filters, households, reminders, calendar)

All four are **additive**; nothing is dropped or rewritten, and existing rows get safe defaults.

| Migration | Adds |
|---|---|
| `0008_item_details.sql` | `items.quantity` (default 1), `brand`, `model`, `tags[]`; tables `item_photos`, `item_documents` |
| `0009_saved_searches.sql` | table `saved_searches` |
| `0010_households.sql` | tables `households`, `household_members`, `household_invites` |
| `0011_reminders_calendar.sql` | `users.reminder_emails` (default false), `users.calendar_token_hash`; table `reminder_log` |

**Order matters:** the new backend selects the new columns on every item and user query, so the migrations must be
applied **before** the new backend serves requests. With the documented start command
(`npm run migrate && npm start`) that is automatic. The previous backend keeps working on the migrated schema
(new columns have defaults), so a rollback of the code alone is safe; there is no rollback script for the schema.

Take a backup first (`BACKUP-RESTORE.md`). Photos and documents grow the database (each at most 5 MB, 5 extra photos and
20 documents per item): watch the database size on the Render plan.

### Migration 0012 (feedback)

Additive: creates table `feedback` (see `FEEDBACK.md`). Applied automatically by `npm run migrate`. No new environment variable.
The new variable `FEEDBACK_NOTIFY_EMAIL` is where feedback notifications go; without it feedback is stored but nobody is notified.

### New optional environment variables

| Variable | Default | Meaning |
|---|---|---|
| `REMINDERS_ENABLED` | unset (off) | `true` starts the hourly check that sends the daily reminder email, only to accounts that switched it on in Settings and only if something needs attention. |
| `REMINDERS_HOUR_UTC` | `6` | The UTC hour from which the daily email may be sent. |

Email delivery uses the existing Resend configuration (`EMAIL.md`). If you run more than one backend instance the
`reminder_log` table keeps a digest from being sent twice. No other variable, cookie, CORS or session setting changed.

### Health checks

`GET /api/health` answers `{ok:true}` without touching the database (liveness). `GET /api/ready` also runs
`SELECT 1` and answers 503 when the database cannot be reached (readiness): use it as the Render health check path
if you want deploys to wait for the database. Neither endpoint is logged and neither returns details.

### Request log

The backend now writes one line per request (`GET /api/items 200 12ms`). Query strings, headers, cookies and bodies are
never logged, and the secret in a calendar feed address is replaced by `:token`.

### Calendar feed

`GET /api/calendar/<token>.ics` is public by design: the 43-character secret in the path is the credential (only its SHA-256
is stored; creating a new one invalidates the old). It is rate limited per IP, sent with `Cache-Control: private, no-store`
and `Referrer-Policy: no-referrer`. Anyone holding the address can read warranty dates, loan return dates and item names (never borrower names) until it is rotated or
turned off in Settings.

### Rate limiting

Limits are in memory per instance (the existing design): household join (10 / 15 min per account), invitation creation
(20 / 15 min), calendar rotate (10 / 15 min), calendar feed (120 / 15 min per IP), import (10 / 15 min), export (5 / 15 min).
