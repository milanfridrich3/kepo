# Account data export

Signed-in people can download everything their account owns from
**Settings → Your data → Download**. It calls `GET /api/account/export`
(`server/src/routes/account.routes.ts`) and saves the answer as
`kepo-export-YYYY-MM-DD.json`.

## What is in the file

`server/src/account/export.ts` (`buildAccountExport`) defines the format; `format` is
`kepo-export` and `version` is `1`. Sections: `account` (email, name, language,
currency, creation time), `locations` (with the full "Parent → Child" path), `items`
(every field, each amount in its own currency, **removed items included** with
`archived: true`; see "Photo link" below), `loans` (full history), `moves` (location history) and `notes`.

## What is deliberately not in it

- Passwords, password hashes, sign-in sessions, one-time codes and reset tokens.
- Internal user ids.
- The binary photos (main item photos and the profile picture). The file only says
  whether one exists (`hasUploadedPhoto`, `hasProfilePicture`). Photos are not a
  full backup and cannot be restored from this file.
- Extra item photos and attached documents (receipts, manuals), saved filters,
  household sharing/membership, the calendar-feed and reminder settings, and feedback messages you sent.
  These are not exported; the file's `notes` and the Settings text say so.

## Photo link (`photoLink`)

`items.photo_url` is the *legacy external link* a person once saved for an item. It
never holds the address of an uploaded photo (that URL is built by the client and not
stored), so no internal path comes from this column. Because older rows were saved
before links were validated, the export (`exportablePhotoLink`) only writes a
well-formed `http(s)` link of at most 2048 characters, and removes any embedded
`user:password@`. Anything else (relative or internal paths, `file:`, `data:`,
`javascript:`, free text) becomes `null`.

Limit: a token placed in a link's query string looks like any other parameter and is
kept. Treat the file as private, like the data it contains.

## CSV export (items only)

**Settings → Your data → Download items as a spreadsheet** calls
`GET /api/account/export.csv` (same data, same rate limit as the JSON export, shared
counter). Columns: `name, category, status, location, quantity, brand, model, tags, purchaseDate,
value, currency, warrantyExpiration, serialNumber, notes, photoLink, archived` (tags are
semicolon-separated; the import reads the same columns back). UTF-8 with BOM (so
Excel shows accents), CRLF lines, RFC 4180 quoting. **Formula protection:** a text
cell starting with `= + - @` (or tab/CR) is written with a leading apostrophe so a
spreadsheet cannot run it; number columns are untouched. Code: `server/src/account/csv.ts`.

## Import (items)

**Settings → Your data → Import items**: choose a CSV or JSON file, read the preview,
confirm. `POST /api/items/import { content, dryRun }` (code: `server/src/account/import.ts`
and `routes/items.routes.ts`). Accepts this app's JSON export, a plain JSON array of
items, or a CSV with a `name` column (other columns optional, header names matched
case-insensitively; a few aliases such as `price`, `description`, `serial`).

- Every row is checked with the same rules as the item form; a bad row is rejected
  with its row number, other rows still import.
- Limits: 500 rows and 90,000 characters per file (the API's JSON body limit is 100 kB).
- Removed (`archived`) rows are skipped. `borrowed` becomes `with_me` (loans are not
  imported). Unknown categories are left empty (the category list is fixed).
- Places are given as `Home → Garage → Shelf`; missing ones are created for the
  signed-in user only, existing ones matched case-insensitively.
- An item that already exists (same name, serial number and place) is skipped, so
  importing the same file twice adds nothing.
- All rows are written in one transaction; the preview (`dryRun`) runs the same steps and
  rolls back. 10 imports per account per 15 minutes.
- Photos and loan history are not imported.
- Messages with a name or number in them are shown in English even with the Czech interface.

## Insights

`GET /api/insights` (`server/src/insights/insights.ts`): totals per currency (never
added across currencies), counts by status, category and top-level place, unplaced and
uncategorised items, warranty buckets (expired / 30 / 90 days), open and overdue loans,
most valuable items per currency. Screen: **Tools → Insights** (`/insights`).

## Behaviour

- One read-only `REPEATABLE READ` transaction, so the file is a consistent snapshot.
- Every query is scoped to the signed-in user (`WHERE user_id = $1`); the loans query
  additionally joins `items` and requires `items.user_id = $1`, so a corrupt cross-user
  loan row can never be exported.
- Rate limit: 5 exports per account per 15 minutes (in-memory, like the other limits).
- No schema change, no new dependency.

## Not yet verified

- **Android:** the Capacitor WebView has no download handler (inferred from the built
  APK, not tested on a device), so a `blob:` download is expected to do nothing. The
  Download button is therefore disabled inside the native app, with an explanation
  (`isNativeApp()`), instead of showing a success message for a file that was not
  saved. A real solution needs Capacitor's Filesystem + Share plugins (not added).
- Photos and documents attached to items are not part of the JSON/CSV export or import
  (they are binary data stored in the database; see docs/BACKUP-RESTORE.md).
