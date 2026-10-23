import { Router } from 'express';
import type { QueryResult } from 'pg';
import { pool, withTransaction } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { badRequest, notFound, conflict } from '../utils/errors';
import { mapItemRow, ITEM_SELECT } from '../db/mappers';
import { STATUSES, ItemStatus } from '../types';
import type { Currency } from '../types';
import {
  parseRouteId, parseOptionalId, parseRequiredString, parseOptionalString, parseOptionalDate,
  parseOptionalMoney, parseOptionalHttpUrl, parseOptionalCurrency, isItemStatus, parseQuantity, parseTags,
} from '../utils/validation';
import { imageUpload, processUploadedImage } from '../utils/imageProcessing';
import { rateLimit } from '../utils/rateLimit';
import { parseItemImport } from '../account/import';
import { runImport } from '../account/importWrite';
import { parseItemFilter } from '../items/filter';
import { listItems, archiveItems, purgeItems, restoreItem, bulkMove, bulkTags, tagCounts, parseIdList } from '../items/service';
import { translateMessage } from '../i18n/messages';

export const itemsRouter = Router();

// Anything that can run a query: the shared pool or a transaction's client.
interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: any[]): Promise<QueryResult<any>>;
}

async function logMove(db: Db, itemId: number, fromLocationId: number | null, toLocationId: number | null) {
  if (fromLocationId === toLocationId) return;
  await db.query(
    'INSERT INTO item_moves (item_id, from_location_id, to_location_id) VALUES ($1, $2, $3)',
    [itemId, fromLocationId, toLocationId]
  );
}

/**
 * Verifies that `locationId` (if not null) belongs to `userId`, throwing a
 * 400 otherwise. The single ownership check reused by every item route
 * that can set an item's location — create, update, and move — so a user
 * can never attach an item to a location owned by someone else.
 */
async function assertLocationOwned(db: Db, userId: number, locationId: number | null) {
  if (locationId === null) return;
  const loc = await db.query('SELECT id FROM locations WHERE id = $1 AND user_id = $2', [locationId, userId]);
  if (loc.rows.length === 0) throw badRequest('Location not found');
}

async function assertCategoryExists(db: Db, categoryId: number | null) {
  if (categoryId === null) return;
  const cat = await db.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (cat.rows.length === 0) throw badRequest('Category not found');
}

/**
 * Loads an item the user owns and that has not been archived ("deleted").
 * Archived items behave as if they no longer exist for every operation.
 * With `lock`, the row is locked for the rest of the transaction, which
 * serialises concurrent lend/return/archive calls on the same item.
 */
async function loadActiveItem(db: Db, id: number, userId: number, lock = false) {
  const { rows } = await db.query(
    `SELECT * FROM items WHERE id = $1 AND user_id = $2 AND archived = false${lock ? ' FOR UPDATE' : ''}`,
    [id, userId]
  );
  if (rows.length === 0) throw notFound('Item not found');
  return rows[0];
}

async function respondWithItem(res: import('express').Response, id: number, status = 200) {
  const { rows } = await pool.query(`${ITEM_SELECT} WHERE i.id = $1`, [id]);
  res.status(status).json({ item: mapItemRow(rows[0]) });
}

interface ParsedItemFields {
  name: string;
  categoryId: number | null;
  photoUrl: string | null;
  locationId: number | null | undefined;
  status: ItemStatus | undefined;
  purchaseDate: string | null;
  value: number | null;
  /** undefined = not supplied (create: use the account default; update: keep the item's own currency). */
  currency: Currency | undefined;
  warrantyExpiration: string | null;
  serialNumber: string | null;
  notes: string | null;
  /** undefined = not supplied (create: default; update: keep what is stored). */
  quantity: number | undefined;
  brand: string | null | undefined;
  model: string | null | undefined;
  tags: string[] | undefined;
}

/** Validates the item body shared by create and update. `currentPhotoUrl` is passed through unchanged when untouched. */
function parseItemFields(b: Record<string, unknown>, currentPhotoUrl?: string | null): ParsedItemFields {
  const name = parseRequiredString(b.name, 'Item name', 200);

  let status: ItemStatus | undefined;
  const rawStatus = b.status;
  if (rawStatus !== undefined && rawStatus !== null && rawStatus !== '') {
    if (!isItemStatus(rawStatus)) throw badRequest(`Status must be one of: ${STATUSES.join(', ')}`);
    status = rawStatus;
  }

  // The legacy external link is validated, except when the client is just
  // echoing back the value already stored (old data may predate validation).
  const photoUrl =
    currentPhotoUrl !== undefined && b.photoUrl === currentPhotoUrl
      ? currentPhotoUrl
      : parseOptionalHttpUrl(b.photoUrl, 'Photo link');

  const purchaseDate = parseOptionalDate(b.purchaseDate, 'Purchase date');
  const warrantyExpiration = parseOptionalDate(b.warrantyExpiration, 'Warranty end date');
  if (purchaseDate && warrantyExpiration && warrantyExpiration < purchaseDate) {
    throw badRequest('The warranty end date cannot be before the purchase date');
  }

  return {
    name,
    categoryId: parseOptionalId(b.categoryId, 'categoryId') ?? null,
    photoUrl,
    locationId: parseOptionalId(b.locationId, 'locationId'),
    status,
    purchaseDate,
    value: parseOptionalMoney(b.value, 'Value'),
    currency: parseOptionalCurrency(b.currency),
    warrantyExpiration,
    serialNumber: parseOptionalString(b.serialNumber, 'Serial number', 100),
    notes: parseOptionalString(b.notes, 'Description', 5000),
    quantity: parseQuantity(b.quantity),
    brand: b.brand === undefined ? undefined : parseOptionalString(b.brand, 'Brand', 100),
    model: b.model === undefined ? undefined : parseOptionalString(b.model, 'Model', 100),
    tags: parseTags(b.tags),
  };
}

// GET /api/items?status=&categoryId=&locationId=&sub=&archived=&search=&tags=&currency=&valueMin=&valueMax=
//                &warranty=&purchasedFrom=&purchasedTo=&hasPhoto=&hasDocuments=&sort=&limit=&offset=
// Filters are validated and turned into SQL in items/filter.ts (values are bound parameters).
// `limit` (1..200) and `offset` are optional; without them the whole list is returned, as before.
itemsRouter.get('/', asyncHandler(async (req, res) => {
  const filter = parseItemFilter(req.query as Record<string, unknown>);
  let page: { limit: number; offset: number } | undefined;
  if (typeof req.query.limit === 'string' && req.query.limit !== '') {
    const limit = Number(req.query.limit);
    const offset = typeof req.query.offset === 'string' && req.query.offset !== '' ? Number(req.query.offset) : 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0 || offset > 1_000_000) throw badRequest('Invalid paging');
    page = { limit, offset };
  }
  res.json({ items: await listItems(pool, req.user!.id, filter, page) });
}));

// GET /api/items/tags: every tag in use with its item count (suggestions, filters).
itemsRouter.get('/tags', asyncHandler(async (req, res) => {
  res.json({ tags: await tagCounts(pool, req.user!.id) });
}));

// Bulk actions (up to 100 items). Declared before the /:id routes so "bulk" is never read as an id.
itemsRouter.post('/bulk/archive', asyncHandler(async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  const userId = req.user!.id;
  const archived = await withTransaction(db => archiveItems(db, userId, ids));
  res.json({ archived });
}));

// Permanently deletes items that are already in the Removed view, with their
// extra photos, documents, loans and move history. Cannot be undone.
itemsRouter.post('/bulk/purge', asyncHandler(async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  const userId = req.user!.id;
  const deleted = await withTransaction(db => purgeItems(db, userId, ids));
  res.json({ deleted });
}));

itemsRouter.post('/bulk/move', asyncHandler(async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  const userId = req.user!.id;
  const locationId = parseOptionalId(req.body?.locationId, 'locationId');
  if (locationId === undefined) throw badRequest('Choose where to move the items');
  const moved = await withTransaction(db => bulkMove(db, userId, ids, locationId));
  res.json({ moved });
}));

itemsRouter.post('/bulk/tags', asyncHandler(async (req, res) => {
  const ids = parseIdList(req.body?.ids);
  const userId = req.user!.id;
  const add = req.body?.add ?? [];
  const remove = req.body?.remove ?? [];
  if (!Array.isArray(add) || !Array.isArray(remove)) throw badRequest('Tags must be a list of text values');
  res.json(await withTransaction(db => bulkTags(db, userId, ids, add, remove)));
}));

// POST /api/items/import  { content: string, dryRun?: boolean }
// Imports items from a Kepo JSON export, a JSON list or a CSV file (rules and
// limits: account/import.ts, docs/DATA-EXPORT.md). Everything is written for the
// signed-in user only, in one transaction: either all valid rows are added or,
// on any database error, none. `dryRun` runs the same steps and rolls back, so
// the preview and the real import cannot disagree. Rows that already exist
// (same name, serial number and location) are skipped, so importing the same
// file twice does not duplicate anything.
itemsRouter.post('/import', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  rateLimit(`import:${userId}`, 10, 15 * 60 * 1000);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body.content !== 'string') throw badRequest('content (the file text) is required');
  const dryRun = body.dryRun === true;

  const cats = await pool.query('SELECT id, name FROM categories');
  const parsed = parseItemImport(body.content, cats.rows.map(r => r.name));
  if (parsed.fatal) throw badRequest(parsed.fatal);
  const categoryIds = new Map<string, number>(cats.rows.map(r => [String(r.name).toLowerCase(), r.id as number]));

  const result = await runImport(withTransaction, userId, req.user!.currency, parsed.rows, categoryIds, dryRun);
  const problems = [...parsed.problems, ...result.problems].sort((a, b) => a.row - b.row);
  res.json({
    dryRun,
    format: parsed.format,
    rowsInFile: parsed.rows.length + parsed.problems.filter(p => p.level === 'error').length + parsed.skippedArchived,
    // In a dry run these say what WOULD happen.
    imported: result.created,
    skippedDuplicates: result.duplicates,
    skippedArchived: parsed.skippedArchived,
    rejected: parsed.problems.filter(p => p.level === 'error').length,
    locationsCreated: result.locationsCreated,
    problems: problems.slice(0, 200).map(p => ({ ...p, message: translateMessage(p.message, req.lang ?? 'en') })),
  });
}));

itemsRouter.get('/:id', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const { rows } = await pool.query(
    `${ITEM_SELECT} WHERE i.id = $1 AND i.user_id = $2 AND i.archived = false`,
    [id, req.user!.id]
  );
  if (rows.length === 0) throw notFound('Item not found');
  res.json({ item: mapItemRow(rows[0]) });
}));

itemsRouter.post('/', asyncHandler(async (req, res) => {
  const f = parseItemFields(req.body ?? {});
  // "Borrowed" means "has an open loan", so it can only be reached through
  // the lend endpoint, which creates that loan in the same transaction.
  if (f.status === 'borrowed') throw badRequest('To mark an item as borrowed, add it first and then use Lend.');
  const userId = req.user!.id;
  const locationId = f.locationId ?? null;

  const id = await withTransaction(async db => {
    await assertLocationOwned(db, userId, locationId);
    await assertCategoryExists(db, f.categoryId);
    const { rows } = await db.query(
      `INSERT INTO items
        (user_id, name, category_id, photo_url, location_id, status, purchase_date, value, currency, warranty_expiration, serial_number, notes,
         quantity, brand, model, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING id`,
      [userId, f.name, f.categoryId, f.photoUrl, locationId, f.status ?? 'with_me', f.purchaseDate, f.value, f.currency ?? req.user!.currency, f.warrantyExpiration, f.serialNumber, f.notes,
        f.quantity ?? 1, f.brand ?? null, f.model ?? null, f.tags ?? []]
    );
    return rows[0].id as number;
  });

  await respondWithItem(res, id, 201);
}));

itemsRouter.put('/:id', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;

  await withTransaction(async db => {
    const before = await loadActiveItem(db, id, userId, true);
    const f = parseItemFields(req.body ?? {}, before.photo_url);
    const status: ItemStatus = f.status ?? before.status;

    // A borrowed item's status can only change via the dedicated return flow
    // (POST /:id/return), which also closes the loan record; and nothing may
    // become "borrowed" except through Lend.
    if (status !== before.status) {
      if (before.status === 'borrowed') {
        throw conflict('This item is currently borrowed. Return it before changing its status.');
      }
      if (status === 'borrowed') {
        throw badRequest('To mark an item as borrowed, use Lend.');
      }
    }

    const newLocationId = f.locationId === undefined ? before.location_id : f.locationId;
    await assertLocationOwned(db, userId, newLocationId);
    await assertCategoryExists(db, f.categoryId);

    await db.query(
      `UPDATE items SET
         name = $1, category_id = $2, photo_url = $3, location_id = $4, status = $5,
         purchase_date = $6, value = $7, currency = $8, warranty_expiration = $9, serial_number = $10,
         notes = $11, quantity = $12, brand = $13, model = $14, tags = $15, updated_at = now()
       WHERE id = $16 AND user_id = $17`,
      [f.name, f.categoryId, f.photoUrl, newLocationId, status, f.purchaseDate, f.value, f.currency ?? before.currency, f.warrantyExpiration, f.serialNumber, f.notes,
        f.quantity ?? before.quantity, f.brand === undefined ? before.brand : f.brand, f.model === undefined ? before.model : f.model, f.tags ?? before.tags, id, userId]
    );
    await logMove(db, id, before.location_id, newLocationId);
  });

  await respondWithItem(res, id);
}));

// "Remove" archives: the item drops out of every list and lookup but can be
// restored from the Removed view, and is only deleted for good by
// POST /bulk/purge. If the item is out on loan the loan is closed in the same
// transaction so it can no longer appear in Borrowed or as overdue. Its main
// photo is released; extra photos, documents, notes, past loans and move
// history are kept until the item is restored or permanently deleted.
itemsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;
  const archived = await withTransaction(db => archiveItems(db, userId, [id]));
  if (archived === 0) throw notFound('Item not found');
  res.status(204).end();
}));

// Brings a removed item back (its extra photos and documents were kept while it was removed).
itemsRouter.post('/:id/restore', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;
  await withTransaction(db => restoreItem(db, userId, id));
  await respondWithItem(res, id);
}));

itemsRouter.post('/:id/move', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;
  const locationId = parseOptionalId(req.body?.locationId, 'locationId');
  if (locationId === undefined) throw badRequest('locationId is required');

  await withTransaction(async db => {
    const before = await loadActiveItem(db, id, userId, true);
    await assertLocationOwned(db, userId, locationId);
    await db.query('UPDATE items SET location_id = $1, updated_at = now() WHERE id = $2', [locationId, id]);
    await logMove(db, id, before.location_id, locationId);
  });

  await respondWithItem(res, id);
}));

// ---- Lending ----

const UNLENDABLE: ItemStatus[] = ['lost', 'sold', 'disposed'];

function parseLoanBody(body: Record<string, unknown>) {
  return {
    borrowerName: parseRequiredString(body.borrowerName, 'Borrower name', 120),
    expectedReturnDate: parseOptionalDate(body.expectedReturnDate, 'Expected return date'),
  };
}

itemsRouter.post('/:id/lend', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;
  const { borrowerName, expectedReturnDate } = parseLoanBody(req.body ?? {});

  await withTransaction(async db => {
    const item = await loadActiveItem(db, id, userId, true);
    if (UNLENDABLE.includes(item.status)) {
      throw conflict(`This item is marked as ${item.status}. Change its status before lending it.`);
    }

    // App-level guard against double-lending, backed at the database level
    // by a partial unique index on borrowings(item_id) WHERE returned = false
    // (migration 0002). The row lock above already serialises concurrent
    // lends of the same item; the index is the final backstop.
    const active = await db.query('SELECT id FROM borrowings WHERE item_id = $1 AND returned = false', [id]);
    if (active.rows.length > 0) throw conflict('This item already has an active loan. Return it before lending it again.');

    await db.query(
      'INSERT INTO borrowings (item_id, user_id, borrower_name, expected_return_date) VALUES ($1,$2,$3,$4)',
      [id, userId, borrowerName, expectedReturnDate]
    );
    await db.query("UPDATE items SET status = 'borrowed', updated_at = now() WHERE id = $1", [id]);
  });

  await respondWithItem(res, id);
}));

// Edit the details of the current loan (borrower name, expected return date).
itemsRouter.put('/:id/loan', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;
  const { borrowerName, expectedReturnDate } = parseLoanBody(req.body ?? {});

  await withTransaction(async db => {
    await loadActiveItem(db, id, userId, true);
    const { rowCount } = await db.query(
      'UPDATE borrowings SET borrower_name = $1, expected_return_date = $2 WHERE item_id = $3 AND returned = false',
      [borrowerName, expectedReturnDate, id]
    );
    if (rowCount === 0) throw conflict('This item has no active loan to edit');
    await db.query('UPDATE items SET updated_at = now() WHERE id = $1', [id]);
  });

  await respondWithItem(res, id);
}));

itemsRouter.post('/:id/return', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;

  await withTransaction(async db => {
    await loadActiveItem(db, id, userId, true);
    const { rowCount } = await db.query(
      `UPDATE borrowings SET returned = true, returned_date = CURRENT_DATE
       WHERE item_id = $1 AND returned = false`,
      [id]
    );
    if (rowCount === 0) throw conflict('This item has no active loan to return');
    await db.query("UPDATE items SET status = 'with_me', updated_at = now() WHERE id = $1", [id]);
  });

  await respondWithItem(res, id);
}));

// ---- Item image ----
// Mirrors the account avatar architecture (see migration 0003 and
// routes/account.routes.ts): uploads are decoded, resized and re-encoded
// server-side via `processUploadedImage`, then stored directly in Postgres
// rather than on disk or in a third-party object store — see migration 0004
// for why. Every handler first confirms the item belongs to the requesting
// user (and is not archived), so this can't read or overwrite another
// user's item image.

const ITEM_IMAGE_BOX = { width: 800, height: 800, fit: 'inside' as const };

itemsRouter.get('/:id/image', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const { rows } = await pool.query(
    'SELECT image_data, image_mime FROM items WHERE id = $1 AND user_id = $2 AND archived = false',
    [id, req.user!.id]
  );
  if (rows.length === 0 || !rows[0].image_data) {
    res.status(404).json({ error: 'No image set' });
    return;
  }
  // The client requests this URL with a `?v=<imageUpdatedAt>` cache-buster
  // (see client/src/lib/itemImage.ts), so the response itself can be
  // cached aggressively and immutably.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Content-Type', rows[0].image_mime);
  res.send(rows[0].image_data);
}));

itemsRouter.post('/:id/image', imageUpload.single('image'), asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const userId = req.user!.id;
  await loadActiveItem(pool, id, userId);

  const file = req.file;
  if (!file) throw badRequest('No image file was uploaded');
  if (!file.mimetype.startsWith('image/')) throw badRequest('File must be an image');

  const output = await processUploadedImage(file.buffer, ITEM_IMAGE_BOX);

  await pool.query(
    `UPDATE items SET image_data = $1, image_mime = 'image/webp', image_updated_at = now()
     WHERE id = $2 AND user_id = $3 AND archived = false`,
    [output, id, userId]
  );
  await respondWithItem(res, id);
}));

itemsRouter.delete('/:id/image', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'item id');
  const { rowCount } = await pool.query(
    `UPDATE items SET image_data = NULL, image_mime = NULL, image_updated_at = NULL
     WHERE id = $1 AND user_id = $2 AND archived = false`,
    [id, req.user!.id]
  );
  if (rowCount === 0) throw notFound('Item not found');
  await respondWithItem(res, id);
}));
