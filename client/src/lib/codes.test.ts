import test from 'node:test';
import assert from 'node:assert/strict';
import { parseKepoCode, itemCode, locationCode, targetPath } from './codes';

test('round trips and routes', () => {
  assert.deepEqual(parseKepoCode(itemCode(12)), { kind: 'item', id: 12 });
  assert.deepEqual(parseKepoCode(locationCode(7)), { kind: 'location', id: 7 });
  assert.deepEqual(parseKepoCode('  KEPO:I:5 '), { kind: 'item', id: 5 });
  assert.equal(targetPath({ kind: 'item', id: 3 }), '/items/3');
  assert.equal(targetPath({ kind: 'location', id: 3 }), '/stuff?locationId=3');
});
test('accepts app addresses', () => {
  assert.deepEqual(parseKepoCode('https://app.kepo.is-cool.dev/items/42'), { kind: 'item', id: 42 });
  assert.deepEqual(parseKepoCode('https://app.kepo.is-cool.dev/locations/9/?x=1'), { kind: 'location', id: 9 });
});
test('rejects everything else', () => {
  for (const bad of ['', 'kepo:i:', 'kepo:i:0', 'kepo:i:-1', 'kepo:x:1', 'kepo:i:1e3', 'kepo:i:12345678901', 'javascript:alert(1)', 'https://x/items/abc', 'hello', 'kepo:i:1 kepo:i:2'])
    assert.equal(parseKepoCode(bad), null, bad);
});

import { resolveScan } from './codes';
test('resolveScan opens Kepo codes and searches everything else', () => {
  assert.deepEqual(resolveScan('https://app.kepo.is-cool.dev/items/5'), { kind: 'open', path: '/items/5' });
  assert.deepEqual(resolveScan('kepo:l:3'), { kind: 'open', path: '/stuff?locationId=3' });
  assert.deepEqual(resolveScan('  '), { kind: 'empty' });
  assert.deepEqual(resolveScan('SN 123/45'), { kind: 'search', path: '/stuff?search=SN%20123%2F45' });
  assert.equal((resolveScan('x'.repeat(300)) as { path: string }).path.length < 130, true);
});
