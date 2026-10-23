import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItemImport, splitLocationPath, IMPORT_MAX_ROWS, IMPORT_MAX_CHARS } from './import';
import { itemsToCsv } from './csv';
import { buildAccountExport } from './export';
import type { Item, User } from '../types';

const CATS = ['Tools', 'Electronics', 'Kitchen'];

test('CSV: valid rows import, columns are matched by header in any order and case', () => {
  const r = parseItemImport('Value,NAME,Category,Status,Location\n12.5,Drill,tools,stored,Home → Garage\n', CATS);
  assert.equal(r.fatal, null);
  assert.equal(r.format, 'csv');
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.rows[0].data, {
    name: 'Drill', category: 'Tools', status: 'stored', locationPath: ['Home', 'Garage'],
    purchaseDate: null, value: 12.5, currency: undefined, warrantyExpiration: null, serialNumber: null, notes: null, photoUrl: null,
    quantity: 1, brand: null, model: null, tags: [],
  });
});

test('CSV: a decimal comma and lower-case currency are accepted', () => {
  const r = parseItemImport('name,value,currency\nLamp,"12,50",eur\n', CATS);
  assert.equal(r.rows[0].data.value, 12.5);
  assert.equal(r.rows[0].data.currency, 'EUR');
});

test('a bad row is rejected with its row number; good rows still import', () => {
  const r = parseItemImport('name,status,purchaseDate,value\nOK,stored,2026-01-02,1\n,stored,,\nBad date,stored,2026-02-31,\nBad status,broken,,\nNeg,stored,,-5\n', CATS);
  assert.deepEqual(r.rows.map(x => x.row), [1]);
  const errs = r.problems.filter(p => p.level === 'error');
  assert.deepEqual(errs.map(e => e.row), [2, 3, 4, 5]);
  assert.match(errs[0].message, /Name is required/);
  assert.match(errs[1].message, /Purchase date/);
  assert.match(errs[2].message, /Status/);
  assert.match(errs[3].message, /Value/);
});

test('warranty before purchase is rejected like in the item form', () => {
  const r = parseItemImport('name,purchaseDate,warrantyExpiration\nX,2026-05-01,2026-01-01\n', CATS);
  assert.equal(r.rows.length, 0);
  assert.match(r.problems[0].message, /before the purchase date/);
});

test('borrowed becomes with_me with a warning; unknown category is dropped with a warning', () => {
  const r = parseItemImport('name,status,category\nBook,borrowed,Nonsense\n', CATS);
  assert.equal(r.rows[0].data.status, 'with_me');
  assert.equal(r.rows[0].data.category, null);
  assert.deepEqual(r.problems.map(p => p.level), ['warning', 'warning']);
});

test('archived rows are skipped and counted', () => {
  const r = parseItemImport('name,archived\nA,false\nB,true\nC,TRUE\n', CATS);
  assert.deepEqual(r.rows.map(x => x.data.name), ['A']);
  assert.equal(r.skippedArchived, 2);
});

test('a non-web photo link is an error for that row, not a stored value', () => {
  const r = parseItemImport('name,photoLink\nA,javascript:alert(1)\nB,https://example.com/x.jpg\n', CATS);
  assert.deepEqual(r.rows.map(x => x.data.name), ['B']);
  assert.equal(r.problems[0].row, 1);
});

test('location paths: separators, trimming and depth limit', () => {
  assert.deepEqual(splitLocationPath(' Home  →  Garage > Shelf '), ['Home', 'Garage', 'Shelf']);
  assert.deepEqual(splitLocationPath(''), []);
  const deep = Array.from({ length: 7 }, (_, i) => `L${i}`).join(' → ');
  const r = parseItemImport(`name,location\nX,${deep}\n`, CATS);
  assert.equal(r.rows.length, 0);
  assert.match(r.problems[0].message, /deeper/);
});

test('formula protection added by the CSV export is removed on CSV import only', () => {
  const csv = parseItemImport("name,notes\n'=EVIL(),'+1 call\n", CATS);
  assert.equal(csv.rows[0].data.name, '=EVIL()');
  assert.equal(csv.rows[0].data.notes, '+1 call');
  const json = parseItemImport(JSON.stringify([{ name: "'=keep", notes: "'+keep" }]), CATS);
  assert.equal(json.rows[0].data.name, "'=keep");
});

test('whole-file problems are reported as fatal, never thrown', () => {
  for (const [content, re] of [
    ['', /empty/],
    ['   \n', /empty/],
    ['name\n', /header row and at least one/],
    ['foo,bar\n1,2\n', /"name" column/],
    ['name\n"oops\n', /not closed/],
    ['{not json', /cannot be read/],
    ['{"hello":1}', /not a Kepo export/],
    ['{"format":"kepo-export","version":2,"items":[]}', /version 2/],
    ['{"format":"kepo-export","version":1}', /no list of items/],
    ['[]', /no items/],
  ] as [string, RegExp][]) {
    const r = parseItemImport(content, CATS);
    assert.match(r.fatal ?? '', re, content);
    assert.equal(r.rows.length, 0);
  }
});

test('size limits', () => {
  const many = 'name\n' + Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `i${i}`).join('\n');
  assert.match(parseItemImport(many, CATS).fatal ?? '', /limit is 500/);
  assert.match(parseItemImport('name\n' + 'x'.repeat(IMPORT_MAX_CHARS), CATS).fatal ?? '', /too large/);
  const ok = 'name\n' + Array.from({ length: IMPORT_MAX_ROWS }, (_, i) => `i${i}`).join('\n');
  assert.equal(parseItemImport(ok, CATS).rows.length, IMPORT_MAX_ROWS);
});

const user: User = { id: 1, email: 'a@b.cz', name: 'A', createdAt: '2026-01-01T00:00:00.000Z', language: 'en', currency: 'CZK', emailVerified: true, avatarUpdatedAt: null, reminderEmails: false };
const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item => ({
  userId: 1, categoryId: null, categoryName: null, photoUrl: null, imageUpdatedAt: null, locationId: null, status: 'with_me',
  purchaseDate: null, value: null, currency: 'CZK', warrantyExpiration: null, serialNumber: null, notes: null, quantity: 1, brand: null, model: null, tags: [], extraPhotoCount: 0, documentCount: 0, archived: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', borrower: null, ...o,
});

test('round trip: our own JSON export and CSV export import back to the same items', () => {
  const doc = buildAccountExport({
    user,
    locations: [{ id: 1, name: 'Home', parentId: null }, { id: 2, name: 'Garage', parentId: 1 }],
    items: [
      item({ id: 1, name: 'Drill, "18V"', categoryName: 'Tools', locationId: 2, value: 1999.5, currency: 'EUR', serialNumber: 'SN-1', notes: 'a\nb', purchaseDate: '2025-01-01', warrantyExpiration: '2027-01-01', photoUrl: 'https://example.com/a.jpg', quantity: 3, brand: 'Bosch', model: 'GSR 18', tags: ['winter', 'garage'] }),
      item({ id: 2, name: '=EVIL()', status: 'lost' }),
      item({ id: 3, name: 'Gone', archived: true }),
    ],
    loans: [], moves: [],
  });
  const fromJson = parseItemImport(JSON.stringify(doc), CATS);
  const fromCsv = parseItemImport(itemsToCsv(doc), CATS);
  for (const r of [fromJson, fromCsv]) {
    assert.equal(r.fatal, null);
    assert.deepEqual(r.problems, []);
    assert.equal(r.skippedArchived, 1);
    assert.deepEqual(r.rows.map(x => x.data), [
      { name: 'Drill, "18V"', category: 'Tools', status: 'with_me', locationPath: ['Home', 'Garage'], purchaseDate: '2025-01-01', value: 1999.5, currency: 'EUR', warrantyExpiration: '2027-01-01', serialNumber: 'SN-1', notes: 'a\nb', photoUrl: 'https://example.com/a.jpg', quantity: 3, brand: 'Bosch', model: 'GSR 18', tags: ['winter', 'garage'] },
      { name: '=EVIL()', category: null, status: 'lost', locationPath: [], purchaseDate: null, value: null, currency: 'CZK', warrantyExpiration: null, serialNumber: null, notes: null, photoUrl: null, quantity: 1, brand: null, model: null, tags: [] },
    ]);
  }
});

test('new item fields: quantity, brand, model and tags are validated like the item form', () => {
  const ok = parseItemImport('name,qty,brand,model,tags\nA,4,Bosch,GSR,"winter; Garage, winter"\n', CATS);
  assert.deepEqual(ok.problems, []);
  assert.deepEqual([ok.rows[0].data.quantity, ok.rows[0].data.brand, ok.rows[0].data.model, ok.rows[0].data.tags], [4, 'Bosch', 'GSR', ['winter', 'Garage']]);
  const bad = parseItemImport('name,quantity,tags\nA,0,\nB,1,' + Array.from({ length: 11 }, (_, i) => `t${i}`).join(';') + '\nC,1,' + 'x'.repeat(40) + '\n', CATS);
  assert.deepEqual(bad.problems.map(p => [p.row, p.level]), [[1, 'error'], [2, 'error'], [3, 'error']]);
  assert.match(bad.problems[0].message, /Quantity/);
  const json = parseItemImport(JSON.stringify([{ name: 'J', quantity: 2, tags: ['a', 'b'] }]), CATS);
  assert.deepEqual([json.rows[0].data.quantity, json.rows[0].data.tags], [2, ['a', 'b']]);
});
