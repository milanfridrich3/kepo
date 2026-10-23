import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import { parseItemImport } from './import';
import { runImport } from './importWrite';
import type { MiniPg } from '../testing/miniPg';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';

async function setup(name: string) {
  const db = await freshDb(name);
  const a = await addUser(db, 'a@x.cz', 'CZK'); const b = await addUser(db, 'b@x.cz');
  const cats = (await db.query('SELECT id, name FROM categories')).rows;
  return { db, a, b, cats, catIds: new Map<string, number>(cats.map(c => [String(c.name).toLowerCase(), c.id as number])) };
}
const tx = (db: MiniPg) => <T>(fn: Parameters<MiniPg['withTransaction']>[0] extends (d: infer D) => any ? (d: D) => Promise<T> : never) => db.withTransaction(fn as any) as Promise<T>;

const FILE = `name,category,status,location,quantity,brand,tags,value,currency,serialNumber
Drill,tools,stored,Home → Garage,2,Bosch,"winter; garage",1999.5,eur,SN1
Lamp,,with_me,,,,,50,,
Drill,tools,stored,home → garage,1,,,1,,SN1
Bad,,nope,,,,,,,
`;

test('import writes for one user, creates places once, skips duplicates, and a dry run changes nothing', { skip }, async t => {
  const { db, a, b, cats, catIds } = await setup('t_import'); t.after(() => db.end());
  const parsed = parseItemImport(FILE, cats.map(c => c.name));
  assert.equal(parsed.rows.length, 3);

  const dry = await runImport(tx(db), a, 'CZK', parsed.rows, catIds, true);
  assert.deepEqual([dry.created, dry.duplicates, dry.locationsCreated], [2, 1, 2]);         // would add 2, skip the repeated Drill, make Home and Garage
  assert.equal((await db.query('SELECT count(*)::int AS n FROM items')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM locations')).rows[0].n, 0);

  const real = await runImport(tx(db), a, 'CZK', parsed.rows, catIds, false);
  assert.deepEqual([real.created, real.duplicates, real.locationsCreated], [2, 1, 2]);       // same numbers as the preview
  const items = (await db.query('SELECT name, user_id, quantity, brand, tags, currency, value, status, category_id, location_id FROM items ORDER BY id')).rows;
  assert.deepEqual(items.map(i => [i.name, i.user_id, i.quantity, i.brand, i.tags, i.currency, i.value]), [
    ['Drill', a, 2, 'Bosch', ['winter', 'garage'], 'EUR', '1999.50'],
    ['Lamp', a, 1, null, [], 'CZK', '50.00'],                                                // account currency when the row has none
  ]);
  assert.equal(items[0].category_id, catIds.get('tools'));
  const locs = (await db.query('SELECT id, name, parent_id, user_id FROM locations ORDER BY id')).rows;
  assert.deepEqual(locs.map(l => [l.name, l.user_id]), [['Home', a], ['Garage', a]]);
  assert.equal(locs[1].parent_id, locs[0].id);
  assert.equal(items[0].location_id, locs[1].id);

  // importing the same file again adds nothing and creates no places
  const again = await runImport(tx(db), a, 'CZK', parsed.rows, catIds, false);
  assert.deepEqual([again.created, again.duplicates, again.locationsCreated], [0, 3, 0]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM items')).rows[0].n, 2);

  // another user gets their own copy and their own places; nothing is shared or matched across users
  const other = await runImport(tx(db), b, 'EUR', parsed.rows, catIds, false);
  assert.deepEqual([other.created, other.duplicates, other.locationsCreated], [2, 1, 2]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM items WHERE user_id = $1', [b])).rows[0].n, 2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM locations WHERE user_id = $1', [b])).rows[0].n, 2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM items WHERE user_id = $1', [a])).rows[0].n, 2);
});

test('a database error half-way rolls everything back', { skip }, async t => {
  const { db, a, cats, catIds } = await setup('t_import_rollback'); t.after(() => db.end());
  const parsed = parseItemImport('name,location,quantity\nOne,P → Q,1\nTwo,P → Q,1\n', cats.map(c => c.name));
  parsed.rows[1].data.quantity = 0;                      // violates the CHECK constraint on the second row
  await assert.rejects(() => runImport(tx(db), a, 'CZK', parsed.rows, catIds, false), /check constraint/);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM items')).rows[0].n, 0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM locations')).rows[0].n, 0);
});
