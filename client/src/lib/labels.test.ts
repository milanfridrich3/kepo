import test from 'node:test';
import assert from 'node:assert/strict';
import { labelPayload, labelShortCode, labelMatrix } from './labels';
import { parseKepoCode } from './codes';

test('payload is an app address the scanner understands', () => {
  const p = labelPayload({ kind: 'item', id: 42 }, 'https://app.kepo.is-cool.dev/');
  assert.equal(p, 'https://app.kepo.is-cool.dev/items/42');
  assert.deepEqual(parseKepoCode(p), { kind: 'item', id: 42 });
  assert.deepEqual(parseKepoCode(labelPayload({ kind: 'location', id: 7 }, 'https://x.test')), { kind: 'location', id: 7 });
  assert.equal(labelShortCode({ kind: 'location', id: 7 }), 'kepo:l:7');
});
test('fits in a QR code', () => assert.ok(labelMatrix({ kind: 'item', id: 2147483647 }, 'https://app.kepo.is-cool.dev')));
