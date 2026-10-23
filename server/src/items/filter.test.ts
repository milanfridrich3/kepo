import test from 'node:test';
import assert from 'node:assert/strict';
import { parseItemFilter, buildItemQuery } from './filter';

test('blank and unknown values are ignored', () => {
  assert.deepEqual(parseItemFilter({}), {});
  assert.deepEqual(parseItemFilter({ status: '', search: '   ', tags: '', foo: 'bar', categoryId: '' }), {});
});

test('canonical form from query-string strings and from saved JSON is the same', () => {
  const fromQuery = parseItemFilter({ status: 'stored,lost', categoryId: '3', locationId: '7', sub: 'true', archived: 'only', search: ' drill ', tags: 'Winter, garage', currency: 'EUR', valueMin: '10,5', valueMax: '99', warranty: 'expiring90', purchasedFrom: '2025-01-01', purchasedTo: '2025-12-31', hasPhoto: 'true', hasDocuments: 'false', sort: 'value' });
  const fromJson = parseItemFilter({ status: ['stored', 'lost'], categoryId: 3, locationId: 7, sub: true, archived: 'only', search: 'drill', tags: ['Winter', 'garage'], currency: 'EUR', valueMin: 10.5, valueMax: 99, warranty: 'expiring90', purchasedFrom: '2025-01-01', purchasedTo: '2025-12-31', hasPhoto: true, hasDocuments: false, sort: 'value' });
  assert.deepEqual(fromQuery, fromJson);
  assert.equal(fromQuery.valueMin, 10.5);
});

test('legacy archived=true still means "include removed items"', () => {
  assert.equal(parseItemFilter({ archived: 'true' }).archived, 'include');
  assert.equal(parseItemFilter({ archived: 'false' }).archived, undefined);
});

test('invalid input is a 400, never reaches SQL', () => {
  for (const bad of [
    { status: 'nope' }, { categoryId: 'abc' }, { locationId: '0' }, { archived: 'maybe' }, { currency: 'XXX' },
    { valueMin: '5' }, { valueMax: '5' }, { currency: 'EUR', valueMin: '9', valueMax: '1' }, { currency: 'EUR', valueMin: '-1' },
    { warranty: 'soon' }, { purchasedFrom: '2025-02-31' }, { purchasedFrom: '2025-05-01', purchasedTo: '2025-01-01' },
    { hasPhoto: 'yes' }, { sort: 'name; DROP TABLE items' }, { search: 5 }, { tags: Array.from({ length: 11 }, (_, i) => `t${i}`) },
  ]) {
    assert.throws(() => parseItemFilter(bad as Record<string, unknown>), (e: any) => e.status === 400, JSON.stringify(bad));
  }
});

test('SQL: user id is always $1, values are parameters, the text never contains user input', () => {
  const evil = "x'; DROP TABLE items; --";
  const q = buildItemQuery(parseItemFilter({ search: evil, tags: evil.slice(0, 20), status: 'stored' }), 42);
  assert.equal(q.params[0], 42);
  assert.ok(!q.where.includes('DROP'));
  assert.ok(!q.prefix.includes('DROP'));
  assert.ok(q.params.includes(`%${evil.replace(/[\\%_]/g, c => '\\' + c)}%`));
  assert.match(q.where, /^i\.user_id = \$1 AND i\.archived = false/);
});
