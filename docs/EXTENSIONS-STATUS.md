# Product Extensions: status against the Extensions document

Source of requirements: the "Kepo — Product Extensions" document (Extensions 1 to 10). It states that
the extensions are **not** a condition for the public release (Kepo 1.0). The Development Flight Plan itself
is not in this repository.

"Done" = every bullet of the extension exists. Most extensions are only **Partial**; the last column says what is missing.
Status was established by reading the code (see the audit report), not by running the app on a device or in production.

| # | Extension | Status | Exists | Missing against the document |
|---|---|---|---|---|
| 1 | iOS application | Not started | docs/IOS.md (steps only; needs macOS, Xcode, Apple Developer account) | Everything |
| 2 | Advanced item management | Partial | quantity, brand (manufacturer), model, serial number, price, purchase date, notes, tags, up to 5 extra photos, bulk actions, restore of removed items, QR labels, in-app scan (camera not verified on a device). docs/ITEM-MANAGEMENT.md | acquisition date, item condition, custom fields, change history (only moves and loans are recorded; no edit/owner-change/status log) |
| 3 | Documents & warranty center | Partial | PDF/image documents per item (type from magic bytes, 20 per item, 5 MB), kinds receipt/warranty/manual/other, download, delete, warranty page and alerts | warranty provider, warranty number, extended warranties, warranty history, documents in the data export, document preview |
| 4 | Sharing & household | Partial (read-only by design) | households up to 6, invite codes (hashed, single-use, 7 days), opt-in read-only limited view. docs/HOUSEHOLD.md | sharing of locations/collections, view/edit/manage roles, shared and personal items side by side, borrowing between members |
| 5 | Smart reminders | Partial | reminders page, opt-in daily email (only when `REMINDERS_ENABLED=true`), warranty end and loan due | push and web notifications, Android notifications, custom/dated/recurring reminders, reminder history. Email delivery never run against a real provider |
| 6 | Import, export, migration | Partial | JSON and CSV export, CSV/JSON item import with preview, duplicate skipping, row-level report. docs/DATA-EXPORT.md | photos and documents in the export, JSON import of the full export (locations, loans, warranties as separate records), backup/restore inside the product, export before account deletion |
| 7 | Advanced search & organisation | Partial | item filter search over name/brand/model/serial/tags (ILIKE, not full-text), URL-kept filters, saved filters, tags, sorting by name/date added/purchase date/value/warranty/recently modified. Note: the top-bar search (`/api/search`) does not search brand, model or tags | real full-text search, notes in the filter search, favourites, collections, custom categories (the category list is fixed), custom-field filters |
| 8 | Insights | Partial | `GET /api/insights` and the Insights screen: counts, value per currency, by status/category/place, warranty buckets, open loans, most valuable | trends over time, most-lent items, newest/oldest items |
| 9 | Integrations | Partial | private calendar feed (.ics, token shown once, revocable), CSV/JSON files | cloud storage, email, OCR, Android share integration, browser sharing |
| 10 | Intelligence | Not started | plain keyword category suggestion, labelled "not AI" | everything AI (recognition, OCR, assistant) |
