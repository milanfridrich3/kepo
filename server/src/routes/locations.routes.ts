import { Router } from 'express';
import type { QueryResult } from 'pg';
import { pool, withTransaction } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { badRequest, conflict, notFound } from '../utils/errors';
import { mapItemRow, ITEM_SELECT } from '../db/mappers';
import { parseRouteId, parseOptionalId, parseRequiredString } from '../utils/validation';

export const locationsRouter = Router();

interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: any[]): Promise<QueryResult<any>>;
}

const LOCATION_COLUMNS = 'id, user_id, name, parent_id';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapLocation = (r: any) => ({ id: r.id, userId: r.user_id, name: r.name, parentId: r.parent_id });

async function loadOwnedLocation(db: Db, id: number, userId: number, lock = false) {
  const { rows } = await db.query(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`,
    [id, userId]
  );
  if (rows.length === 0) throw notFound('Location not found');
  return rows[0];
}

/**
 * Serialises every change to one user's place hierarchy (move/rename and delete).
 * Without it, two concurrent moves (A under B, B under A) each pass the cycle
 * check against the other's uncommitted state and both commit, leaving a cycle.
 * A transaction-scoped advisory lock keyed on the user id is released
 * automatically at COMMIT/ROLLBACK and, unlike locking rows, cannot deadlock
 * with the row locks taken below.
 */
async function lockUserLocations(db: Db, userId: number) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1), $2)', ['kepo.locations', userId]);
}

/** Two places in the same parent may not share a name (case-insensitive) — they would be indistinguishable in every picker. */
async function assertNameFree(db: Db, userId: number, parentId: number | null, name: string, exceptId?: number) {
  const { rows } = await db.query(
    `SELECT id FROM locations
     WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND lower(name) = lower($3) AND id <> COALESCE($4, 0)`,
    [userId, parentId, name, exceptId ?? null]
  );
  if (rows.length > 0) throw conflict('A place with that name already exists here.');
}

// Flat list — the client builds the visual tree from parentId.
locationsRouter.get('/', asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT ${LOCATION_COLUMNS} FROM locations WHERE user_id = $1 ORDER BY name, id`,
    [req.user!.id]
  );
  res.json({ locations: rows.map(mapLocation) });
}));

locationsRouter.post('/', asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const name = parseRequiredString(req.body?.name, 'Location name', 100);
  const parentId = parseOptionalId(req.body?.parentId, 'parentId') ?? null;

  const created = await withTransaction(async db => {
    if (parentId !== null) {
      const parent = await db.query('SELECT id FROM locations WHERE id = $1 AND user_id = $2', [parentId, userId]);
      if (parent.rows.length === 0) throw badRequest('Parent location not found');
    }
    await assertNameFree(db, userId, parentId, name);
    const { rows } = await db.query(
      `INSERT INTO locations (user_id, name, parent_id) VALUES ($1, $2, $3) RETURNING ${LOCATION_COLUMNS}`,
      [userId, name, parentId]
    );
    return rows[0];
  });
  res.status(201).json({ location: mapLocation(created) });
}));

// Rename and/or move a location. `parentId` omitted = leave where it is,
// null = make it top level. A place can never be moved inside itself or one
// of its own descendants (that would detach the subtree into a cycle).
locationsRouter.put('/:id', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'location id');
  const userId = req.user!.id;
  const name = parseRequiredString(req.body?.name, 'Location name', 100);
  const parentInput = parseOptionalId(req.body?.parentId, 'parentId');

  const updated = await withTransaction(async db => {
    await lockUserLocations(db, userId);
    const before = await loadOwnedLocation(db, id, userId, true);
    const parentId: number | null = parentInput === undefined ? before.parent_id : parentInput;

    if (parentId !== null) {
      if (parentId === id) throw badRequest('A place cannot be inside itself.');
      const parent = await db.query('SELECT id FROM locations WHERE id = $1 AND user_id = $2', [parentId, userId]);
      if (parent.rows.length === 0) throw badRequest('Parent location not found');
      const cycle = await db.query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM locations WHERE parent_id = $1 AND user_id = $3
           UNION
           SELECT l.id FROM locations l JOIN descendants d ON l.parent_id = d.id WHERE l.user_id = $3
         )
         SELECT 1 FROM descendants WHERE id = $2`,
        [id, parentId, userId]
      );
      if (cycle.rows.length > 0) throw badRequest('A place cannot be moved inside one of its own sub-places.');
    }

    await assertNameFree(db, userId, parentId, name, id);
    const { rows } = await db.query(
      `UPDATE locations SET name = $1, parent_id = $2 WHERE id = $3 AND user_id = $4 RETURNING ${LOCATION_COLUMNS}`,
      [name, parentId, id, userId]
    );
    return rows[0];
  });
  res.json({ location: mapLocation(updated) });
}));

// Delete a location without ever destroying or silently orphaning data:
//  * its sub-places move up to its parent (the schema's ON DELETE CASCADE on
//    parent_id would otherwise delete them), and
//  * the items inside it must be sent somewhere explicitly:
//    ?moveItemsTo=<locationId> or ?moveItemsTo=none (no location). If the
//    place still holds items and the caller says nothing, the request is
//    refused with 409 rather than guessing.
// (These moves are not added to the dashboard's move log: the schema nulls
// the deleted place in any log row, so the entry would read "Unassigned → X".)
locationsRouter.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseRouteId(req.params.id, 'location id');
  const userId = req.user!.id;
  const raw = typeof req.query.moveItemsTo === 'string' ? req.query.moveItemsTo : undefined;
  const destination: number | null | undefined =
    raw === undefined || raw === '' ? undefined : raw === 'none' ? null : parseOptionalId(raw, 'moveItemsTo');

  await withTransaction(async db => {
    await lockUserLocations(db, userId);
    const loc = await loadOwnedLocation(db, id, userId, true);

    const { rows: counted } = await db.query(
      'SELECT COUNT(*)::int AS count FROM items WHERE location_id = $1 AND user_id = $2 AND archived = false',
      [id, userId]
    );
    const itemCount: number = counted[0].count;

    if (destination === id) throw badRequest('Choose a different place to move the items to.');
    if (destination !== undefined && destination !== null) {
      await loadOwnedLocation(db, destination, userId).catch(() => {
        throw badRequest('Destination location not found');
      });
    }
    if (itemCount > 0 && destination === undefined) {
      throw conflict(
        `${loc.name} still holds ${itemCount} ${itemCount === 1 ? 'item' : 'items'}. Choose where to move ${itemCount === 1 ? 'it' : 'them'} first.`
      );
    }

    // Includes archived items, so no row is left pointing at a deleted place.
    await db.query(
      'UPDATE items SET location_id = $1, updated_at = now() WHERE location_id = $2 AND user_id = $3',
      [destination ?? null, id, userId]
    );
    await db.query('UPDATE locations SET parent_id = $1 WHERE parent_id = $2 AND user_id = $3', [loc.parent_id, id, userId]);
    await db.query('DELETE FROM locations WHERE id = $1 AND user_id = $2', [id, userId]);
  });
  res.status(204).end();
}));

// Items directly in this location AND any of its descendants (nested
// locations), via a recursive CTE starting from the requested id.
locationsRouter.get('/:id/items', asyncHandler(async (req, res) => {
  const locationId = parseRouteId(req.params.id, 'location id');
  const loc = await pool.query('SELECT id FROM locations WHERE id = $1 AND user_id = $2', [locationId, req.user!.id]);
  if (loc.rows.length === 0) throw notFound('Location not found');

  const { rows } = await pool.query(
    `WITH RECURSIVE descendants AS (
       SELECT id FROM locations WHERE id = $1
       UNION
       SELECT l.id FROM locations l JOIN descendants d ON l.parent_id = d.id
     )
     ${ITEM_SELECT}
     WHERE i.user_id = $2 AND i.archived = false AND i.location_id IN (SELECT id FROM descendants)
     ORDER BY i.name, i.id`,
    [locationId, req.user!.id]
  );
  res.json({ items: rows.map(mapItemRow) });
}));
