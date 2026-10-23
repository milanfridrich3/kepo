# Item management, files, search, labels

Reference for the features added on top of the basic item list. Server code is under `server/src/items`,
`server/src/routes`, client code under `client/src/pages` and `client/src/components`.

## Item details
`quantity` (1 to 9999; `value` is for the whole entry, not per piece), `brand`, `model` (100 characters),
`tags` (up to 10, 30 characters each, trimmed, duplicates ignored regardless of case). Validation lives in
`server/src/utils/validation.ts` and is repeated softly in the form.

## Extra photos and documents
- Up to **5 extra photos** and **20 documents** per item, each at most **5 MB**.
- The file type is decided from the file's own bytes (PDF, JPEG, PNG, WebP), never from the name or the declared type.
- Images are decoded and re-encoded (embedded metadata such as GPS is removed). PDFs are stored unchanged.
- Documents are always served as a download (`Content-Disposition: attachment`, global `nosniff`), never rendered inside the app's origin.
- Every query is scoped to the signed-in account and the item (`user_id` and `item_id`); another account's file ids answer 404.
- Removed items keep their files, so restoring an item restores them too.
- **Not executed here:** the Express/multer/sharp upload routes (`routes/itemFiles.routes.ts`). The checks around them (type sniffing,
  file names, limits, isolation) have unit and PostgreSQL tests; the HTTP route glue was reviewed by reading only.

## Search, filters, saved filters
`GET /api/items` accepts `status, categoryId, locationId (+sub), archived (only|include), search, tags, currency, valueMin, valueMax,
warranty, purchasedFrom, purchasedTo, hasPhoto, hasDocuments, sort, limit, offset`. Everything is validated in
`server/src/items/filter.ts`; the SQL text is fixed fragments and every value is a bound parameter. `search` matches name, brand, model,
serial number and tags (a `%` or `_` typed by the person is a literal). Filters live in the page address, so a view can be bookmarked; **Save this
view** stores the same filter (max 20 per account, names unique ignoring case). Amount filters compare within one currency only.

## Bulk actions and restore
Select items (up to 100) to move, add/remove tags, or remove. Removing is reversible: **Filters → Show → Removed items**, select, **Restore**.
Items that are lent out cannot be removed (return them first). Each bulk call is one transaction and only touches items the account owns.

## Category suggestion
When adding an item the form can offer a category based on keywords (English and Czech) in the name, brand and model. This is a **plain keyword lookup,
not AI**; it is shown as a suggestion and never applied automatically (`server/src/suggest/category.ts`).

## QR labels and scanning
- **Labels** (Tools → Labels): pick places and items, choose a size, print. Each QR contains only a link such as
  `https://app.kepo.is-cool.dev/items/42` and the same short code is printed under it (`kepo:i:42`, `kepo:l:7`). Nothing about the item is in the code,
  and opening it still requires signing in as the owner.
- The QR encoder is written in the app (`client/src/lib/qr.ts`, byte mode, error correction M, versions 1 to 10, up to 213 bytes, no dependency). Its test renders
  every length from 1 to 213 plus accented, CJK and emoji text and decodes each image with OpenCV's `QRCodeDetectorAruco`; all decode to the exact text.
  OpenCV's older detector failed on about 6 % of the same valid images (it reads them at another scale), so it is not the authority.
- **Scan** (Tools → Scan): uses the browser's `getUserMedia` and `BarcodeDetector` where available and always offers typing the code. A Kepo code or link opens
  the item or place; any other text (a serial number, a product barcode) searches your items. Not verified with a real camera (the test browser has none).
- Printing from the Android app is not available (see `ANDROID.md`).

## Reminders
Warranties ending within 30 days and loans that are overdue or due within 3 days appear under Tools → Reminders. An optional daily email (off by default;
opt in under Settings → Notifications, and `REMINDERS_ENABLED=true` on the server) lists the same things. See `DEPLOYMENT.md`.

## Calendar feed
Settings → Notifications → Calendar feed creates a private `.ics` address with warranty end dates and loan return dates (subscribe from any calendar app).
Only a hash of the secret is stored, so the address is shown once; creating a new one replaces the old; turning it off disables it. Treat the address like a password.

## Household
Read the rules in `HOUSEHOLD.md`.
