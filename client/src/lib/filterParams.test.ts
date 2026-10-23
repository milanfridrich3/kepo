import test from 'node:test';
import assert from 'node:assert/strict';
import { paramsToFilter, filterToParams, filterToApiParams, advancedFilterCount, isFilterEmpty } from './filterParams';

const parse = (qs: string) => paramsToFilter(new URLSearchParams(qs));

test('round trip of every filter', () => {
  const f = { status: ['stored', 'lost'], categoryId: 3, locationId: 9, sub: true, archived: 'only' as const, search: 'drill', tags: ['garage', 'blue'],
    currency: 'EUR' as const, valueMin: 10, valueMax: 99.5, warranty: 'expiring30' as const, purchasedFrom: '2024-01-01', purchasedTo: '2024-12-31',
    hasPhoto: true, hasDocuments: true, sort: 'value' };
  assert.deepEqual(parse(filterToParams(f).toString()), f);
});

test('old place links still mean "this place and everything below it"', () => {
  assert.deepEqual(parse('locationId=5'), { locationId: 5, sub: true });
  assert.equal(filterToApiParams({ locationId: 5 }).sub, 'true');
});

test('garbage in the address is ignored, never passed on', () => {
  assert.deepEqual(parse('categoryId=abc&locationId=-1&valueMin=1e5&valueMax=--&purchasedFrom=yesterday&currency=BTC&warranty=never&sort=drop table&archived=all&hasPhoto=yes'), {});
  assert.deepEqual(parse('search=%20%20'), {});
  assert.equal(parse('search=' + 'x'.repeat(300)).search?.length, 100);
  assert.equal(parse('valueMin=1,5').valueMin, 1.5);
});

test('counts advanced filters and detects empty', () => {
  assert.equal(advancedFilterCount({ tags: ['a'], hasPhoto: true, warranty: 'none' }), 3);
  assert.equal(advancedFilterCount({ status: ['stored'], search: 'x' }), 0);
  assert.equal(advancedFilterCount({ valueMin: 0 }), 1);
  assert.ok(isFilterEmpty({}));
  assert.ok(!isFilterEmpty({ search: 'a' }));
});
