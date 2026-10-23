// Dependency-free unit tests: run with `npm test -w client` (node:test via tsx).
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCsvFileName, exportFileName, isNativeApp, toJsonText } from './download';

test('exportFileName is dated in UTC', () => {
  assert.equal(exportFileName(new Date('2026-10-12T12:00:00.000Z')), 'kepo-export-2026-10-12.json');
  assert.equal(exportFileName(new Date('2026-01-05T23:59:59.000Z')), 'kepo-export-2026-01-05.json');
});

test('toJsonText is readable, ends with a newline and round-trips (including non-ASCII)', () => {
  const data = { name: 'Příliš žluťoučký kůň', items: [{ id: 1, value: 12.5 }] };
  const text = toJsonText(data);
  assert.ok(text.endsWith('}\n'));
  assert.ok(text.includes('\n  "items"'));
  assert.deepEqual(JSON.parse(text), data);
});

test('isNativeApp is true only when Capacitor reports a native platform', () => {
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => false } }), false);
  assert.equal(isNativeApp({ Capacitor: {} }), false);
  assert.equal(isNativeApp({}), false);
  assert.equal(isNativeApp(undefined), false);
  assert.equal(isNativeApp(null), false);
  assert.equal(isNativeApp({ Capacitor: { isNativePlatform: () => { throw new Error('boom'); } } }), false);
});

test('the CSV file name is dated in UTC and matches the server\'s', () => {
  assert.equal(exportCsvFileName(new Date('2026-10-12T23:59:59.000Z')), 'kepo-export-2026-10-12-items.csv');
});
