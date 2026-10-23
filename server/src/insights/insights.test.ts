import test from 'node:test';
import assert from 'node:assert/strict';
import { computeInsights } from './insights';
import type { InsightItem, InsightLocation, InsightLoan } from './insights';

const loc: InsightLocation[] = [
  { id: 1, name: 'Home', parentId: null },
  { id: 2, name: 'Garage', parentId: 1 },
  { id: 3, name: 'Shelf', parentId: 2 },
  { id: 4, name: 'Office', parentId: null },
];
const it = (o: Partial<InsightItem> & Pick<InsightItem, 'id' | 'name'>): InsightItem => ({
  categoryName: null, status: 'with_me', locationId: null, value: null, currency: 'CZK', purchaseDate: null, warrantyExpiration: null, ...o,
});
const TODAY = '2026-10-13';

test('empty account gives zeros and no NaN', () => {
  const r = computeInsights([], [], [], TODAY);
  assert.equal(r.itemCount, 0);
  assert.deepEqual(r.valueByCurrency, []);
  assert.deepEqual(r.byRootLocation, []);
  assert.equal(r.openLoans.oldest, null);
  assert.ok(!JSON.stringify(r).includes('null,null,NaN'));
});

test('values are totalled per currency, never mixed, with exact cents', () => {
  const items = [
    it({ id: 1, name: 'A', value: 0.1, currency: 'EUR' }),
    it({ id: 2, name: 'B', value: 0.2, currency: 'EUR' }),
    it({ id: 3, name: 'C', value: 1000, currency: 'CZK' }),
    it({ id: 4, name: 'D' }),
  ];
  const r = computeInsights(items, loc, [], TODAY);
  assert.deepEqual(r.valueByCurrency, [
    { currency: 'CZK', total: 1000, itemsWithValue: 1 },
    { currency: 'EUR', total: 0.3, itemsWithValue: 2 }, // 0.1 + 0.2 is 0.30000000000000004 in floating point
  ]);
  assert.equal(r.itemsWithoutValue, 1);
});

test('most valuable is ranked inside each currency only', () => {
  const items = [
    it({ id: 1, name: 'Cheap EUR', value: 5, currency: 'EUR' }),
    it({ id: 2, name: 'Big CZK', value: 50000, currency: 'CZK' }),
    it({ id: 3, name: 'Small CZK', value: 100, currency: 'CZK' }),
  ];
  const r = computeInsights(items, loc, [], TODAY);
  assert.deepEqual(r.mostValuable.map(g => [g.currency, g.items.map(i => i.name)]), [['CZK', ['Big CZK', 'Small CZK']], ['EUR', ['Cheap EUR']]]);
});

test('items roll up to the top-level place, unplaced and uncategorized are counted', () => {
  const items = [
    it({ id: 1, name: 'A', locationId: 3, categoryName: 'Tools', value: 10 }),
    it({ id: 2, name: 'B', locationId: 2, categoryName: 'Tools', value: 5 }),
    it({ id: 3, name: 'C', locationId: 4 }),
    it({ id: 4, name: 'D' }),
  ];
  const r = computeInsights(items, loc, [], TODAY);
  assert.deepEqual(r.byRootLocation.map(x => [x.location, x.count]), [['Home', 2], ['Office', 1], [null, 1]]);
  assert.deepEqual(r.byRootLocation[0].valueByCurrency, [{ currency: 'CZK', total: 15 }]);
  assert.equal(r.unplaced, 1);
  assert.equal(r.uncategorized, 2);
  assert.deepEqual(r.byCategory[0], { category: 'Tools', count: 2 });
});

test('a location cycle in bad data does not hang', () => {
  const bad: InsightLocation[] = [{ id: 1, name: 'A', parentId: 2 }, { id: 2, name: 'B', parentId: 1 }];
  const r = computeInsights([it({ id: 1, name: 'X', locationId: 1 })], bad, [], TODAY);
  assert.equal(r.byRootLocation.length, 1);
});

test('warranty buckets use calendar days and match the warranty page boundaries', () => {
  const w = (d: string | null, id: number) => it({ id, name: `w${id}`, warrantyExpiration: d });
  const r = computeInsights([
    w('2026-10-12', 1), // yesterday: expired
    w('2026-10-13', 2), // today: next30
    w('2026-11-12', 3), // +30: next30
    w('2026-11-13', 4), // +31: next90
    w('2027-01-11', 5), // +90: next90
    w('2027-01-12', 6), // +91: active, not listed
    w(null, 7),
  ], loc, [], TODAY);
  assert.deepEqual(r.warranties, { expired: 1, next30: 2, next90: 2, none: 1 });
});

test('open loans: count, overdue and oldest', () => {
  const loans: InsightLoan[] = [
    { itemId: 2, itemName: 'Drill', borrowerName: 'Petr', lentDate: '2026-09-01', expectedReturnDate: '2026-10-01' },
    { itemId: 1, itemName: 'Book', borrowerName: 'Eva', lentDate: '2026-08-01', expectedReturnDate: null },
    { itemId: 3, itemName: 'Lamp', borrowerName: 'Jan', lentDate: '2026-10-10', expectedReturnDate: '2026-10-13' },
  ];
  const r = computeInsights([], loc, loans, TODAY);
  assert.equal(r.openLoans.count, 3);
  assert.equal(r.openLoans.overdue, 1); // due today is not overdue yet
  assert.deepEqual(r.openLoans.oldest, { itemName: 'Book', borrowerName: 'Eva', lentDate: '2026-08-01' });
});

test('status counts are ordered by size then name', () => {
  const r = computeInsights([
    it({ id: 1, name: 'a', status: 'stored' }), it({ id: 2, name: 'b', status: 'stored' }), it({ id: 3, name: 'c', status: 'lost' }),
  ], loc, [], TODAY);
  assert.deepEqual(r.byStatus, [{ status: 'stored', count: 2 }, { status: 'lost', count: 1 }]);
});
