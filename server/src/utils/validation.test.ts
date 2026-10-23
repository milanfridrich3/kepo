// Dependency-free unit tests: run with `npm test -w server` (node:test via tsx).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRouteId, parseOptionalId, parseOptionalDate, parseOptionalMoney, parseOptionalHttpUrl,
  parseRequiredString, parseOptionalString, parseEmail, parseNewPassword, escapeLike, isItemStatus,
} from './validation';
import { HttpError } from './errors';

const throws400 = (fn: () => unknown) =>
  assert.throws(fn, (err: unknown) => err instanceof HttpError && err.status === 400);

test('parseRouteId', () => {
  assert.equal(parseRouteId('12'), 12);
  for (const bad of ['0', '-1', '1.5', 'abc', '', '99999999999']) throws400(() => parseRouteId(bad));
});

test('parseOptionalId', () => {
  assert.equal(parseOptionalId(undefined, 'x'), undefined);
  assert.equal(parseOptionalId(null, 'x'), null);
  assert.equal(parseOptionalId('7', 'x'), 7);
  for (const bad of ['', ' ', 'a', 0, -3, 1.2, {}, []]) throws400(() => parseOptionalId(bad, 'x'));
});

test('parseOptionalDate', () => {
  assert.equal(parseOptionalDate('2026-02-28', 'd'), '2026-02-28');
  assert.equal(parseOptionalDate('', 'd'), null);
  assert.equal(parseOptionalDate(null, 'd'), null);
  for (const bad of ['2026-02-31', '2026-13-01', '26-1-1', 'tomorrow', 20260101, '1800-01-01', '2026-02-28T00:00:00Z']) {
    throws400(() => parseOptionalDate(bad, 'd'));
  }
});

test('parseOptionalMoney', () => {
  assert.equal(parseOptionalMoney('12.345', 'v'), 12.35);
  assert.equal(parseOptionalMoney(0, 'v'), 0);
  assert.equal(parseOptionalMoney('', 'v'), null);
  for (const bad of ['abc', -1, 1e20, NaN, Infinity, {}, true]) throws400(() => parseOptionalMoney(bad, 'v'));
});

test('parseOptionalHttpUrl', () => {
  assert.equal(parseOptionalHttpUrl('https://a.example/x.png', 'u'), 'https://a.example/x.png');
  assert.equal(parseOptionalHttpUrl('  ', 'u'), null);
  for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', 'ftp://x.y']) {
    throws400(() => parseOptionalHttpUrl(bad, 'u'));
  }
});

test('strings', () => {
  assert.equal(parseRequiredString('  Drill ', 'Name', 10), 'Drill');
  throws400(() => parseRequiredString('   ', 'Name', 10));
  throws400(() => parseRequiredString('x'.repeat(11), 'Name', 10));
  throws400(() => parseRequiredString(5, 'Name', 10));
  assert.equal(parseOptionalString('', 'n', 5), null);
  throws400(() => parseOptionalString(5, 'n', 5));
});

test('parseEmail / parseNewPassword', () => {
  assert.equal(parseEmail('  Foo@Bar.COM '), 'foo@bar.com');
  for (const bad of ['a@b', 'no-at', '@x.cz', 'a b@c.de', 5, `${'a'.repeat(250)}@b.cz`]) throws400(() => parseEmail(bad));
  assert.equal(parseNewPassword('12345678'), '12345678');
  throws400(() => parseNewPassword('short'));
  throws400(() => parseNewPassword('x'.repeat(73)));
});

test('escapeLike / isItemStatus', () => {
  assert.equal(escapeLike('100%_\\'), '100\\%\\_\\\\');
  assert.equal(isItemStatus('stored'), true);
  assert.equal(isItemStatus('nope'), false);
});

import { parseQuantity, parseTags, splitTagText } from './validation';

test('parseQuantity: whole numbers 1..9999, blank means not supplied', () => {
  assert.equal(parseQuantity(undefined), undefined);
  assert.equal(parseQuantity(null), undefined);
  assert.equal(parseQuantity(''), undefined);
  assert.equal(parseQuantity(3), 3);
  assert.equal(parseQuantity(' 12 '), 12);
  for (const bad of [0, -1, 1.5, 10000, 'abc', NaN, {}]) assert.throws(() => parseQuantity(bad), /Quantity/);
});

test('parseTags: trims, collapses spaces, dedupes ignoring case, limits', () => {
  assert.equal(parseTags(undefined), undefined);
  assert.deepEqual(parseTags(null), []);
  assert.deepEqual(parseTags(['  Winter  gear ', 'winter GEAR', '', 'Tools']), ['Winter gear', 'Tools']);
  assert.deepEqual(parseTags(['ž', 'Ž']), ['ž']);
  assert.throws(() => parseTags('tools'), /list/);
  assert.throws(() => parseTags([1]), /list/);
  assert.throws(() => parseTags(['a\nb']), /control/);
  assert.throws(() => parseTags(['x'.repeat(31)]), /30/);
  assert.equal(parseTags(Array.from({ length: 10 }, (_, i) => `t${i}`))!.length, 10);
  assert.throws(() => parseTags(Array.from({ length: 11 }, (_, i) => `t${i}`)), /at most 10/);
  assert.deepEqual(splitTagText('a; b, c'), ['a', ' b', ' c']);
});
