import { badRequest, conflict, notFound } from '../utils/errors';
import { ITEM_SELECT, mapItemRow } from '../db/mappers';
import { parseRequiredString, parseTags } from '../utils/validation';
import { buildItemQuery, parseItemFilter } from './filter';
import type { ItemFilter } from './filter';
import type { Item } from '../types';

/**
 * Item-related database logic that is more than one statement, kept out of the
 * route files so it can be exercised against a real PostgreSQL in tests
 * (items/service.pg.test.ts). Every function takes the signed-in user's id and
 * scopes every statement to it. Functions that write expect to run inside a
 * transaction (`withTransaction`); the callers do that.
 */

export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export const MAX_BULK_IDS = 100;
export const MAX_SAVED_SEARCHES = 20;

export function parseIdList(raw: unknown, label = 'ids'): number[] {
  if (!Array.isArray(raw) || raw.length === 0) throw badRequest(`Choose at least one item`);
  if (raw.length > MAX_BULK_IDS) throw badRequest(`Choose at most ${MAX_BULK_IDS} items at a time`);
  const out = new Set<number>();
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > 2147483647) throw badRequest(`Invalid ${label}`);
    out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

export async function listItems(db: Db, userId: number, filter: ItemFilter, page?: { limit: number; offset: number }): Promise<Item[]> {
  const q = buildItemQuery(filter, userId);
  let sql = `${q.prefix}${ITEM_SELECT} WHERE ${q.where} ORDER BY ${q.orderBy}`;
  const params = [...q.params];
  if (page) {
    params.push(page.limit, page.offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }
  const { rows } = await db.query(sql, params);
  return rows.map(mapItemRow);
}

/** "Delete": archives. Closes open loans, drops the primary photo (as the single-item route always did). Returns how many items were archived. */
export async function archiveItems(db: Db, userId: number, ids: number[]): Promise<number> {
  const { rows } = await db.query(
    'SELECT id FROM items WHERE id = ANY($1::int[]) AND user_id = $2 AND archived = false ORDER BY id FOR UPDATE',
    [ids, userId]
  );
  const found = rows.map(r => r.id as number);
  if (found.length === 0) return 0;
  await db.query('UPDATE borrowings SET returned = true, returned_date = CURRENT_DATE WHERE item_id = ANY($1::int[]) AND returned = false', [found]);
  await db.query(
    `UPDATE items SET archived = true,
            status = CASE WHEN status = 'borrowed' THEN 'with_me'::item_status ELSE status END,
            image_data = NULL, image_mime = NULL, image_updated_at = NULL,
            updated_at = now()
     WHERE id = ANY($1::int[]) AND user_id = $2`,
    [found, userId]
  );
  return found.length;
}

/** Brings a removed item back. 404 when it does not exist, is not removed, or is not the user's. */
export async function restoreItem(db: Db, userId: number, id: number): Promise<void> {
  const { rows } = await db.query(
    'SELECT id FROM items WHERE id = $1 AND user_id = $2 AND archived = true FOR UPDATE',
    [id, userId]
  );
  if (rows.length === 0) throw notFound('Item not found');
  await db.query('UPDATE items SET archived = false, updated_at = now() WHERE id = $1 AND user_id = $2', [id, userId]);
}

/**
 * Permanently deletes items that are already removed (archived): the item row and,
 * through ON DELETE CASCADE, its extra photos, documents, loans and move history.
 * Active items are never touched. Returns how many were deleted.
 */
export async function purgeItems(db: Db, userId: number, ids: number[]): Promise<number> {
  const { rows } = await db.query(
    'DELETE FROM items WHERE id = ANY($1::int[]) AND user_id = $2 AND archived = true RETURNING id',
    [ids, userId]
  );
  return rows.length;
}

/** Moves many active items to one place (or to "no place" with null) and logs each real move. */
export async function bulkMove(db: Db, userId: number, ids: number[], locationId: number | null): Promise<number> {
  if (locationId !== null) {
    const loc = await db.query('SELECT id FROM locations WHERE id = $1 AND user_id = $2', [locationId, userId]);
    if (loc.rows.length === 0) throw badRequest('Location not found');
  }
  const { rows } = await db.query(
    `WITH target AS (
       SELECT id, location_id FROM items
        WHERE id = ANY($1::int[]) AND user_id = $2 AND archived = false
        ORDER BY id FOR UPDATE
     ), logged AS (
       INSERT INTO item_moves (item_id, from_location_id, to_location_id)
       SELECT id, location_id, $3::int FROM target WHERE location_id IS DISTINCT FROM $3::int
       RETURNING item_id
     )
     UPDATE items SET location_id = $3::int, updated_at = now()
      WHERE id IN (SELECT id FROM target) AND user_id = $2
      RETURNING id`,
    [ids, userId, locationId]
  );
  return rows.length;
}

/** Adds and/or removes tags on many active items. Items that would end up with more than the maximum are skipped. */
export async function bulkTags(db: Db, userId: number, ids: number[], add: string[], remove: string[]): Promise<{ updated: number; skipped: number }> {
  const addTags = parseTags(add) ?? [];
  const removeKeys = new Set((parseTags(remove) ?? []).map(t => t.toLowerCase()));
  if (addTags.length === 0 && removeKeys.size === 0) throw badRequest('Choose a tag to add or remove');
  const { rows } = await db.query(
    'SELECT id, tags FROM items WHERE id = ANY($1::int[]) AND user_id = $2 AND archived = false ORDER BY id FOR UPDATE',
    [ids, userId]
  );
  let updated = 0, skipped = 0;
  for (const row of rows) {
    const kept = (row.tags as string[]).filter(t => !removeKeys.has(t.toLowerCase()));
    let next: string[];
    try { next = parseTags([...kept, ...addTags]) ?? []; } catch { skipped++; continue; }
    await db.query('UPDATE items SET tags = $1::text[], updated_at = now() WHERE id = $2 AND user_id = $3', [next, row.id, userId]);
    updated++;
  }
  return { updated, skipped };
}

/** Every tag the user has used, with how many active items carry it (for suggestions and filters). */
export async function tagCounts(db: Db, userId: number): Promise<{ tag: string; count: number }[]> {
  const { rows } = await db.query(
    `SELECT min(tg) AS tag, count(*)::int AS count
       FROM items i, unnest(i.tags) tg
      WHERE i.user_id = $1 AND i.archived = false
      GROUP BY lower(tg) ORDER BY count DESC, lower(tg)`,
    [userId]
  );
  return rows.map(r => ({ tag: r.tag as string, count: r.count as number }));
}

// ---- saved filters ----

export interface SavedSearch { id: number; name: string; query: ItemFilter; createdAt: string }

export async function listSavedSearches(db: Db, userId: number): Promise<SavedSearch[]> {
  const { rows } = await db.query('SELECT id, name, query, created_at FROM saved_searches WHERE user_id = $1 ORDER BY lower(name)', [userId]);
  return rows.map(r => ({ id: r.id, name: r.name, query: r.query, createdAt: (r.created_at as Date).toISOString() }));
}

export async function createSavedSearch(db: Db, userId: number, rawName: unknown, rawQuery: unknown): Promise<SavedSearch> {
  const name = parseRequiredString(rawName, 'Name', 60);
  if (!rawQuery || typeof rawQuery !== 'object' || Array.isArray(rawQuery)) throw badRequest('The filter is not valid');
  const query = parseItemFilter(rawQuery as Record<string, unknown>);
  if (Object.keys(query).length === 0) throw badRequest('Set at least one filter before saving');
  const count = await db.query('SELECT count(*)::int AS n FROM saved_searches WHERE user_id = $1', [userId]);
  if (count.rows[0].n >= MAX_SAVED_SEARCHES) throw conflict(`You can save up to ${MAX_SAVED_SEARCHES} filters`);
  try {
    const { rows } = await db.query(
      'INSERT INTO saved_searches (user_id, name, query) VALUES ($1, $2, $3::jsonb) RETURNING id, name, query, created_at',
      [userId, name, JSON.stringify(query)]
    );
    const r = rows[0];
    return { id: r.id, name: r.name, query: r.query, createdAt: (r.created_at as Date).toISOString() };
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw conflict('A saved filter with that name already exists');
    throw err;
  }
}

export async function deleteSavedSearch(db: Db, userId: number, id: number): Promise<void> {
  const { rowCount } = await db.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!rowCount) throw notFound('Saved filter not found');
}
