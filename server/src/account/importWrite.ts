import type { Db } from '../items/service';
import type { ImportProblem, ImportRow } from './import';
import type { Currency } from '../types';

/**
 * Writes validated import rows for ONE user. Everything runs in a single
 * transaction: any database error leaves nothing behind, and `dryRun` runs the
 * very same steps and rolls back, so the preview cannot disagree with the real
 * import. Places named in a row's path are created for this user only (matched
 * case-insensitively when they already exist); an item that already exists
 * (same name, serial number and place) is skipped, so a file imported twice adds
 * nothing the second time.
 */

export interface ImportOutcome {
  created: number;
  duplicates: number;
  locationsCreated: number;
  problems: ImportProblem[];
}

class DryRunDone extends Error {}

type WithTransaction = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export async function runImport(
  withTransaction: WithTransaction,
  userId: number,
  defaultCurrency: Currency,
  rows: { row: number; data: ImportRow }[],
  categoryIds: Map<string, number>,
  dryRun: boolean
): Promise<ImportOutcome> {
  const out: ImportOutcome = { created: 0, duplicates: 0, locationsCreated: 0, problems: [] };
  try {
    await withTransaction(async db => {
      const locs = await db.query('SELECT id, name, parent_id FROM locations WHERE user_id = $1 ORDER BY id', [userId]);
      // "parentId|lowercased name" -> id (lowest id wins if old data has twins)
      const locIndex = new Map<string, number>();
      for (const l of locs.rows) {
        const key = `${l.parent_id ?? 'root'}|${String(l.name).toLowerCase()}`;
        if (!locIndex.has(key)) locIndex.set(key, l.id);
      }
      const existing = await db.query(
        'SELECT name, serial_number, location_id FROM items WHERE user_id = $1 AND archived = false', [userId]
      );
      const seen = new Set<string>(existing.rows.map(r =>
        `${String(r.name).toLowerCase()}|${r.serial_number ?? ''}|${r.location_id ?? ''}`));

      for (const { row, data } of rows) {
        let parent: number | null = null;
        for (const part of data.locationPath) {
          const key = `${parent ?? 'root'}|${part.toLowerCase()}`;
          let id = locIndex.get(key);
          if (id === undefined) {
            const ins = await db.query(
              'INSERT INTO locations (user_id, name, parent_id) VALUES ($1, $2, $3) RETURNING id', [userId, part, parent]
            );
            id = ins.rows[0].id as number;
            locIndex.set(key, id);
            out.locationsCreated++;
          }
          parent = id;
        }
        const dupKey = `${data.name.toLowerCase()}|${data.serialNumber ?? ''}|${parent ?? ''}`;
        if (seen.has(dupKey)) {
          out.duplicates++;
          out.problems.push({ row, level: 'warning', message: `"${data.name}" already exists in that place and was skipped.` });
          continue;
        }
        seen.add(dupKey);
        await db.query(
          `INSERT INTO items
            (user_id, name, category_id, photo_url, location_id, status, purchase_date, value, currency, warranty_expiration, serial_number, notes,
             quantity, brand, model, tags)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::text[])`,
          [userId, data.name, data.category === null ? null : categoryIds.get(data.category.toLowerCase()) ?? null,
            data.photoUrl, parent, data.status, data.purchaseDate, data.value,
            data.currency ?? defaultCurrency, data.warrantyExpiration, data.serialNumber, data.notes,
            data.quantity, data.brand, data.model, data.tags]
        );
        out.created++;
      }
      if (dryRun) throw new DryRunDone();
    });
  } catch (err) {
    if (!(err instanceof DryRunDone)) throw err;
  }
  return out;
}
