import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, itemsToCsv, parseCsv, unprotectCell, CSV_BOM, ITEM_CSV_COLUMNS } from './csv';
import { buildAccountExport } from './export';
import type { Item, User } from '../types';

test('cells are quoted only when needed, and quotes are doubled', () => {
  assert.equal(csvCell('plain'), 'plain');
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
});

test('text that a spreadsheet would run as a formula is neutralised; numbers are not', () => {
  for (const evil of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '\t=x', '=HYPERLINK("http://x","y")']) {
    assert.ok(csvCell(evil).replace(/^"/, '').startsWith("'"), `should be prefixed: ${evil}`);
  }
  assert.equal(csvCell(-5.5, 'number'), '-5.5');
  assert.equal(csvCell(1999.5, 'number'), '1999.5');
  assert.equal(csvCell('Drill'), 'Drill');
  assert.equal(unprotectCell("'=1+1"), '=1+1');
  assert.equal(unprotectCell("'hello"), "'hello"); // only undoes our own protection
});

test('parser handles quotes, embedded newlines, CRLF, BOM and blank lines', () => {
  const text = `${CSV_BOM}a,b,c\r\n1,"x,y","he said ""no"""\r\n\r\n"multi\nline",2,3\n`;
  const { rows, error } = parseCsv(text);
  assert.equal(error, null);
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'x,y', 'he said "no"'], ['multi\nline', '2', '3']]);
});

test('parser keeps empty fields and a last line without newline', () => {
  assert.deepEqual(parseCsv('a,,c\n,,').rows, [['a', '', 'c'], ['', '', '']]);
  assert.deepEqual(parseCsv('x,y').rows, [['x', 'y']]);
});

test('an unclosed quote is reported, not thrown', () => {
  const r = parseCsv('a,b\n"oops,1\n');
  assert.match(r.error ?? '', /not closed/);
});

const user: User = { id: 1, email: 'a@b.cz', name: 'A', createdAt: '2026-01-01T00:00:00.000Z', language: 'en', currency: 'CZK', emailVerified: true, avatarUpdatedAt: null, reminderEmails: false };
const item = (o: Partial<Item> & Pick<Item, 'id' | 'name'>): Item => ({
  userId: 1, categoryId: null, categoryName: null, photoUrl: null, imageUpdatedAt: null, locationId: null, status: 'with_me',
  purchaseDate: null, value: null, currency: 'CZK', warrantyExpiration: null, serialNumber: null, notes: null, quantity: 1, brand: null, model: null, tags: [], extraPhotoCount: 0, documentCount: 0, archived: false,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', borrower: null, ...o,
});

test('items CSV: header, BOM, CRLF, one line per item, round-trips through the parser', () => {
  const doc = buildAccountExport({
    user,
    locations: [{ id: 1, name: 'Home', parentId: null }, { id: 2, name: 'Garage', parentId: 1 }],
    items: [
      item({ id: 1, name: 'Drill, 18V', categoryName: 'Tools', locationId: 2, quantity: 3, brand: 'Bosch', model: 'GSR 18', tags: ['winter', 'garage'], value: 1999.5, notes: 'line1\nline2 "q"' }),
      item({ id: 2, name: '=EVIL()', archived: true, status: 'sold', currency: 'EUR', value: 12 }),
    ],
    loans: [], moves: [],
  });
  const csv = itemsToCsv(doc);
  assert.ok(csv.startsWith(CSV_BOM + ITEM_CSV_COLUMNS.join(',') + '\r\n'));
  assert.ok(csv.endsWith('\r\n'));
  const { rows, error } = parseCsv(csv);
  assert.equal(error, null);
  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], 'Drill, 18V');
  assert.equal(rows[1][3], 'Home → Garage');
  assert.deepEqual(rows[1].slice(4, 8), ['3', 'Bosch', 'GSR 18', 'winter; garage']);
  assert.equal(rows[1][9], '1999.5');
  assert.equal(rows[1][13], 'line1\nline2 "q"');
  assert.equal(rows[2][0], "'=EVIL()");
  assert.equal(rows[2][15], 'true');
  assert.ok(rows.every(r => r.length === ITEM_CSV_COLUMNS.length));
});
