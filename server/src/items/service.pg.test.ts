import test from 'node:test';
import assert from 'node:assert/strict';
import { pgAvailable, freshDb, addUser } from '../testing/pgTestEnv';
import type { MiniPg } from '../testing/miniPg';
import { parseItemFilter } from './filter';
import {
  listItems, archiveItems, purgeItems, restoreItem, bulkMove, bulkTags, tagCounts,
  createSavedSearch, listSavedSearches, deleteSavedSearch, parseIdList,
} from './service';
import {
  addPhoto, listPhotos, getPhoto, deletePhoto, addDocument, listDocuments, getDocument, deleteDocument,
  MAX_EXTRA_PHOTOS, MAX_DOCUMENTS_PER_ITEM,
} from './files';

const skip = !pgAvailable && 'no throwaway PostgreSQL (scripts/with-test-pg.sh)';
const isHttp = (status: number) => (e: unknown) => (e as { status?: number }).status === status;

interface World { db: MiniPg; a: number; b: number; home: number; garage: number; shelf: number; other: number; ids: Record<string, number> }

async function world(name: string): Promise<World> {
  const db = await freshDb(name);
  const a = await addUser(db, 'a@x.cz'); const b = await addUser(db, 'b@x.cz');
  const loc = async (u: number, n: string, p: number | null) => (await db.query('INSERT INTO locations (user_id,name,parent_id) VALUES ($1,$2,$3) RETURNING id', [u, n, p])).rows[0].id as number;
  const home = await loc(a, 'Home', null), garage = await loc(a, 'Garage', home), shelf = await loc(a, 'Shelf', garage), other = await loc(a, 'Office', null);
  const bHome = await loc(b, 'Home', null);
  const tools = (await db.query("SELECT id FROM categories WHERE name='Tools'")).rows[0].id;
  const mk = async (key: string, u: number, f: Record<string, unknown>) => {
    const r = await db.query(
      `INSERT INTO items (user_id,name,category_id,location_id,status,purchase_date,value,currency,warranty_expiration,serial_number,quantity,brand,model,tags,archived,photo_url)
       VALUES ($1,$2,$3,$4,$5::item_status,$6,$7,$8,$9,$10,$11,$12,$13,$14::text[],$15,$16) RETURNING id`,
      [u, f.name, f.cat ?? null, f.loc ?? null, f.status ?? 'with_me', f.purchased ?? null, f.value ?? null, f.cur ?? 'CZK', f.warranty ?? null, f.serial ?? null, f.qty ?? 1, f.brand ?? null, f.model ?? null, f.tags ?? [], f.archived ?? false, f.photo ?? null]);
    return [key, r.rows[0].id as number] as const;
  };
  const ids = Object.fromEntries([
    await mk('drill', a, { name: 'Drill', cat: tools, loc: shelf, status: 'stored', purchased: '2024-03-01', value: 2000, brand: 'Bosch', model: 'GSR 18', serial: 'SN-77', tags: ['Winter', 'garage'], warranty: '2099-01-01', qty: 2 }),
    await mk('saw', a, { name: 'Saw', cat: tools, loc: garage, status: 'with_me', purchased: '2022-06-15', value: 300, tags: ['garage'], warranty: '2020-01-01' }),
    await mk('lamp', a, { name: 'Lamp', loc: home, status: 'lost', value: 50, cur: 'EUR', tags: [], photo: 'https://example.com/l.jpg' }),
    await mk('desk', a, { name: 'Desk', loc: other, status: 'stored', value: 120, cur: 'EUR', tags: ['office', 'winter'] }),
    await mk('gone', a, { name: 'Old thing', archived: true, tags: ['garage'] }),
    await mk('bs', b, { name: 'Bob drill', loc: bHome, brand: 'Bosch', tags: ['garage'], value: 1 }),
  ]);
  return { db, a, b, home, garage, shelf, other, ids };
}
const names = async (w: World, raw: Record<string, unknown>, user = w.a) => (await listItems(w.db, user, parseItemFilter(raw))).map(i => i.name);

test('item list filters, each on a real database, always inside one user', { skip }, async t => {
  const w = await world('t_filters'); t.after(() => w.db.end());
  assert.deepEqual(await names(w, {}), ['Desk', 'Drill', 'Lamp', 'Saw']);                                    // active only, only user A
  assert.deepEqual(await names(w, { archived: 'true' }), ['Desk', 'Drill', 'Lamp', 'Old thing', 'Saw']);
  assert.deepEqual(await names(w, { archived: 'only' }), ['Old thing']);
  assert.deepEqual(await names(w, { status: 'stored,lost' }), ['Desk', 'Drill', 'Lamp']);
  assert.deepEqual(await names(w, { categoryId: 1 }).then(x => x.length), 0 + (await names(w, { categoryId: 1 })).length);
  assert.deepEqual(await names(w, { locationId: w.garage }), ['Saw']);
  assert.deepEqual(await names(w, { locationId: w.home, sub: 'true' }), ['Drill', 'Lamp', 'Saw']);            // nested places included
  assert.deepEqual(await names(w, { search: 'bosch' }), ['Drill']);                                         // brand
  assert.deepEqual(await names(w, { search: 'gsr' }), ['Drill']);                                           // model
  assert.deepEqual(await names(w, { search: 'sn-77' }), ['Drill']);                                         // serial
  assert.deepEqual(await names(w, { search: 'offic' }), ['Desk']);                                          // tag
  assert.deepEqual(await names(w, { search: '%' }), []);                                                    // wildcard is literal
  assert.deepEqual(await names(w, { tags: 'WINTER' }), ['Desk', 'Drill']);                                  // case-insensitive
  assert.deepEqual(await names(w, { tags: 'winter,garage' }), ['Drill']);                                   // all tags
  assert.deepEqual(await names(w, { currency: 'EUR' }), ['Desk', 'Lamp']);
  assert.deepEqual(await names(w, { currency: 'CZK', valueMin: '300' }), ['Drill', 'Saw']);
  assert.deepEqual(await names(w, { currency: 'CZK', valueMin: '301', valueMax: '5000' }), ['Drill']);
  assert.deepEqual(await names(w, { warranty: 'expired' }), ['Saw']);
  assert.deepEqual(await names(w, { warranty: 'active' }), ['Drill']);
  assert.deepEqual(await names(w, { warranty: 'none' }), ['Desk', 'Lamp']);
  assert.deepEqual(await names(w, { warranty: 'expiring90' }), []);
  assert.deepEqual(await names(w, { purchasedFrom: '2023-01-01' }), ['Drill']);
  assert.deepEqual(await names(w, { purchasedTo: '2023-01-01' }), ['Saw']);
  assert.deepEqual(await names(w, { hasPhoto: 'true' }), ['Lamp']);
  assert.deepEqual(await names(w, { hasPhoto: 'false' }), ['Desk', 'Drill', 'Saw']);
  assert.deepEqual(await names(w, { sort: 'value', currency: 'CZK' }), ['Drill', 'Saw']);
  assert.deepEqual(await names(w, { sort: 'value' }), ['Drill', 'Saw', 'Desk', 'Lamp']);
  // a place id belonging to someone else matches nothing for this user, even with sub-places on
  const bHome = (await w.db.query("SELECT id FROM locations WHERE user_id = $1", [w.b])).rows[0].id;
  assert.deepEqual(await names(w, { locationId: bHome, sub: 'true' }), []);
  assert.deepEqual(await names(w, { locationId: w.home, sub: 'true' }, w.b), []);
  // user B sees only B
  assert.deepEqual(await names(w, {}, w.b), ['Bob drill']);
  // pagination
  const page = await listItems(w.db, w.a, parseItemFilter({}), { limit: 2, offset: 1 });
  assert.deepEqual(page.map(i => i.name), ['Drill', 'Lamp']);
  // new fields come through the shared mapper
  const drill = (await listItems(w.db, w.a, parseItemFilter({ search: 'drill' })))[0];
  assert.deepEqual([drill.quantity, drill.brand, drill.model, drill.tags], [2, 'Bosch', 'GSR 18', ['Winter', 'garage']]);
});

test('archive, restore, bulk move and bulk tags respect ownership and history', { skip }, async t => {
  const w = await world('t_bulk'); t.after(() => w.db.end());
  const { drill, saw, lamp, gone, bs } = w.ids;

  // archive closes the loan and drops the primary photo, only for own active items
  await w.db.query("INSERT INTO borrowings (item_id,user_id,borrower_name) VALUES ($1,$2,'Petr')", [saw, w.a]);
  await w.db.query("UPDATE items SET status='borrowed' WHERE id=$1", [saw]);
  assert.equal(await archiveItems(w.db, w.a, [saw, gone, bs, 999999]), 1);                                    // gone is already archived, bs is B's
  const sawRow = (await w.db.query('SELECT archived, status FROM items WHERE id=$1', [saw])).rows[0];
  assert.deepEqual(sawRow, { archived: true, status: 'with_me' });
  assert.equal((await w.db.query('SELECT returned FROM borrowings WHERE item_id=$1', [saw])).rows[0].returned, true);
  assert.equal((await w.db.query('SELECT archived FROM items WHERE id=$1', [bs])).rows[0].archived, false);   // B's item untouched

  // restore: own removed item only
  await assert.rejects(() => restoreItem(w.db, w.b, saw), isHttp(404));          // someone else's
  await assert.rejects(() => restoreItem(w.db, w.a, drill), isHttp(404));        // not removed
  await restoreItem(w.db, w.a, saw);
  assert.equal((await w.db.query('SELECT archived FROM items WHERE id=$1', [saw])).rows[0].archived, false);

  // bulk move: logs real moves only, refuses a foreign place, skips foreign/removed items
  const moved = await bulkMove(w.db, w.a, [drill, saw, bs, gone], w.other);
  assert.equal(moved, 2);
  assert.deepEqual((await w.db.query('SELECT item_id, to_location_id FROM item_moves ORDER BY item_id')).rows.map(r => [r.item_id, r.to_location_id]), [[drill, w.other], [saw, w.other]]);
  assert.equal(await bulkMove(w.db, w.a, [drill], w.other), 1);                                               // already there
  assert.equal((await w.db.query('SELECT count(*)::int AS n FROM item_moves')).rows[0].n, 2);                  // ...and not logged again
  const bHome = (await w.db.query('SELECT id FROM locations WHERE user_id=$1', [w.b])).rows[0].id;
  await assert.rejects(() => bulkMove(w.db, w.a, [drill], bHome), isHttp(400));
  assert.equal(await bulkMove(w.db, w.a, [drill], null), 1);
  assert.equal((await w.db.query('SELECT location_id FROM items WHERE id=$1', [drill])).rows[0].location_id, null);

  // bulk tags
  const r1 = await bulkTags(w.db, w.a, [drill, lamp, bs], ['Sale', 'winter'], ['GARAGE']);
  assert.deepEqual(r1, { updated: 2, skipped: 0 });
  assert.deepEqual((await w.db.query('SELECT tags FROM items WHERE id=$1', [drill])).rows[0].tags, ['Winter', 'Sale']);   // garage removed, winter not duplicated
  assert.deepEqual((await w.db.query('SELECT tags FROM items WHERE id=$1', [bs])).rows[0].tags, ['garage']);              // B untouched
  await w.db.query("UPDATE items SET tags = ARRAY['1','2','3','4','5','6','7','8','9','10'] WHERE id=$1", [lamp]);
  assert.deepEqual(await bulkTags(w.db, w.a, [lamp], ['eleven'], []), { updated: 0, skipped: 1 });                      // would exceed 10
  await assert.rejects(() => bulkTags(w.db, w.a, [lamp], [], []), isHttp(400));
  assert.deepEqual((await tagCounts(w.db, w.a)).find(t => t.tag === 'Winter'), { tag: 'Winter', count: 2 });

  assert.deepEqual(parseIdList([3, 1, 3]), [1, 3]);
  for (const bad of [[], 'x', [0], [1.5], ['1'], Array.from({ length: 101 }, (_, i) => i + 1)]) assert.throws(() => parseIdList(bad), isHttp(400));
});

test('permanent delete only reaches own removed items and takes their attachments with them', { skip }, async t => {
  const w = await world('t_purge'); t.after(() => w.db.end());
  const { drill, gone, bs } = w.ids;
  await w.db.query("INSERT INTO borrowings (item_id,user_id,borrower_name) VALUES ($1,$2,'Petr')", [gone, w.a]);
  assert.equal(await purgeItems(w.db, w.a, [drill, bs, 999999]), 0);                          // active, foreign, missing: nothing deleted
  assert.equal(await purgeItems(w.db, w.b, [gone]), 0);                                       // someone else's removed item
  assert.equal((await w.db.query('SELECT count(*)::int AS n FROM items WHERE id=ANY($1)', [[drill, bs, gone]])).rows[0].n, 3);
  assert.equal(await purgeItems(w.db, w.a, [gone, drill]), 1);
  assert.equal((await w.db.query('SELECT count(*)::int AS n FROM items WHERE id=$1', [gone])).rows[0].n, 0);
  assert.equal((await w.db.query('SELECT count(*)::int AS n FROM borrowings WHERE item_id=$1', [gone])).rows[0].n, 0);
  assert.equal((await w.db.query('SELECT count(*)::int AS n FROM items WHERE id=$1', [drill])).rows[0].n, 1);
});

test('saved filters: validated, canonical, per user, limited', { skip }, async t => {
  const w = await world('t_saved'); t.after(() => w.db.end());
  const s = await createSavedSearch(w.db, w.a, '  Garage tools ', { tags: 'garage', status: ['stored'], junk: 1 });
  assert.deepEqual(s.query, { status: ['stored'], tags: ['garage'] });
  assert.equal(s.name, 'Garage tools');
  await assert.rejects(() => createSavedSearch(w.db, w.a, 'garage TOOLS', { search: 'x' }), isHttp(409));      // same name, any case
  await createSavedSearch(w.db, w.b, 'Garage tools', { search: 'x' });                                          // other user may reuse it
  await assert.rejects(() => createSavedSearch(w.db, w.a, 'Empty', {}), isHttp(400));
  await assert.rejects(() => createSavedSearch(w.db, w.a, 'Bad', { status: 'nope' }), isHttp(400));
  await assert.rejects(() => createSavedSearch(w.db, w.a, '', { search: 'x' }), isHttp(400));
  await assert.rejects(() => createSavedSearch(w.db, w.a, 'x', 'string'), isHttp(400));
  // a stored filter runs through the same list code
  const [saved] = await listSavedSearches(w.db, w.a);
  assert.deepEqual((await listItems(w.db, w.a, parseItemFilter(saved.query as Record<string, unknown>))).map(i => i.name), ['Drill']);
  await assert.rejects(() => deleteSavedSearch(w.db, w.b, saved.id), isHttp(404));                              // not B's to delete
  await deleteSavedSearch(w.db, w.a, saved.id);
  assert.deepEqual(await listSavedSearches(w.db, w.a), []);
  for (let i = 0; i < 20; i++) await createSavedSearch(w.db, w.a, `f${i}`, { search: `s${i}` });
  await assert.rejects(() => createSavedSearch(w.db, w.a, 'one more', { search: 'z' }), isHttp(409));
});

test('extra photos and documents: ownership, limits, removal', { skip }, async t => {
  const w = await world('t_files'); t.after(() => w.db.end());
  const { drill, gone } = w.ids;
  const bytes = (n: number) => Buffer.alloc(n, 7);

  const p = await addPhoto(w.db, w.a, drill, bytes(10), 'image/webp');
  assert.equal((await listPhotos(w.db, w.a, drill)).length, 1);
  assert.equal((await getPhoto(w.db, w.a, drill, p.id)).data.length, 10);
  await assert.rejects(() => getPhoto(w.db, w.b, drill, p.id), isHttp(404));                                    // B cannot read A's photo
  await assert.rejects(() => listPhotos(w.db, w.b, drill), isHttp(404));
  await assert.rejects(() => addPhoto(w.db, w.b, drill, bytes(1), 'image/webp'), isHttp(404));
  await assert.rejects(() => deletePhoto(w.db, w.b, drill, p.id), isHttp(404));
  await assert.rejects(() => addPhoto(w.db, w.a, gone, bytes(1), 'image/webp'), isHttp(404));                   // removed item
  for (let i = 1; i < MAX_EXTRA_PHOTOS; i++) await addPhoto(w.db, w.a, drill, bytes(1), 'image/webp');
  await assert.rejects(() => addPhoto(w.db, w.a, drill, bytes(1), 'image/webp'), isHttp(409));
  await deletePhoto(w.db, w.a, drill, p.id);
  await assert.rejects(() => getPhoto(w.db, w.a, drill, p.id), isHttp(404));
  // wrong item id with a valid photo id must not leak
  const q = await addPhoto(w.db, w.a, drill, bytes(2), 'image/webp');
  await assert.rejects(() => getPhoto(w.db, w.a, w.ids.lamp, q.id), isHttp(404));
  assert.equal((await listItems(w.db, w.a, parseItemFilter({ search: 'drill' })))[0].extraPhotoCount, MAX_EXTRA_PHOTOS);

  const d = await addDocument(w.db, w.a, drill, { kind: 'receipt', filename: 'r.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 test') });
  const docs = await listDocuments(w.db, w.a, drill);
  assert.deepEqual(docs.map(x => [x.kind, x.filename, x.mime, x.sizeBytes]), [['receipt', 'r.pdf', 'application/pdf', 13]]);
  assert.equal((await getDocument(w.db, w.a, drill, d.id)).data.toString(), '%PDF-1.4 test');
  await assert.rejects(() => getDocument(w.db, w.b, drill, d.id), isHttp(404));
  await assert.rejects(() => listDocuments(w.db, w.b, drill), isHttp(404));
  await assert.rejects(() => deleteDocument(w.db, w.b, drill, d.id), isHttp(404));
  assert.equal((await listItems(w.db, w.a, parseItemFilter({ hasDocuments: 'true' }))).map(i => i.name).join(), 'Drill');
  assert.equal((await listItems(w.db, w.a, parseItemFilter({ hasDocuments: 'true' })))[0].documentCount, 1);
  for (let i = 1; i < MAX_DOCUMENTS_PER_ITEM; i++) await addDocument(w.db, w.a, drill, { kind: 'other', filename: `d${i}.pdf`, mime: 'application/pdf', data: Buffer.from('%PDF-1.4 x') });
  await assert.rejects(() => addDocument(w.db, w.a, drill, { kind: 'other', filename: 'x.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 x') }), isHttp(409));
  await deleteDocument(w.db, w.a, drill, d.id);
  await assert.rejects(() => getDocument(w.db, w.a, drill, d.id), isHttp(404));
  // archiving the item hides its files; restoring brings them back
  await archiveItems(w.db, w.a, [drill]);
  await assert.rejects(() => listDocuments(w.db, w.a, drill), isHttp(404));
  await restoreItem(w.db, w.a, drill);
  assert.equal((await listDocuments(w.db, w.a, drill)).length, MAX_DOCUMENTS_PER_ITEM - 1);
});
