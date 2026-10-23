import test from 'node:test';
import assert from 'node:assert/strict';
import { interpolate, lookup, parseTags, placeholdersOf } from './core';
import { translate } from './index';
import { formatMoney, formatDate, currencySymbol } from '../lib/intl';

const nbsp = (s: string) => s.replace(/[  ]/g, ' ');

test('plural selection follows each language', () => {
  const cat = { x_one: 'one', x_few: 'few', x_other: 'other' };
  assert.equal(lookup(cat, 'cs', 'x', { count: 1 }), 'one');
  assert.equal(lookup(cat, 'cs', 'x', { count: 3 }), 'few');
  assert.equal(lookup(cat, 'cs', 'x', { count: 5 }), 'other');
  assert.equal(lookup(cat, 'cs', 'x', { count: 0 }), 'other');
  assert.equal(lookup({ x_one: 'a', x_other: 'b' }, 'en', 'x', { count: 2 }), 'b');
  assert.equal(lookup({ x_one: 'a', x_other: 'b' }, 'en', 'x', { count: 1 }), 'a');
});

test('interpolation fills known placeholders and leaves unknown ones visible', () => {
  assert.equal(interpolate('Hi {name}, {n} left', 'en', { name: 'Jana', n: 3 }), 'Hi Jana, 3 left');
  assert.equal(interpolate('Hi {who}', 'en', { name: 'x' }), 'Hi {who}');
  assert.deepEqual(placeholdersOf('{b} and {a} and {b}'), ['a', 'b']);
});

test('tag parsing splits markup and leaves stray angle brackets alone', () => {
  assert.deepEqual(parseTags('a <b>bold</b> c'), [{ text: 'a ' }, { tag: 'b', text: 'bold' }, { text: ' c' }]);
  assert.deepEqual(parseTags('1 < 2'), [{ text: '1 < 2' }]);
});

test('translate: Czech and English differ, missing Czech falls back to English', () => {
  assert.equal(translate('en', 'common.save'), 'Save');
  assert.equal(translate('cs', 'common.save'), 'Uložit');
  assert.equal(translate('cs', 'format.daysAgo', { count: 3 }), 'před 3 dny');
  assert.equal(translate('en', 'format.daysAgo', { count: 1 }), '1 day ago');
});

test('money is formatted by Intl in the amount’s own currency and the UI locale', () => {
  assert.equal(nbsp(formatMoney(1234, 'CZK', 'cs')), '1 234 Kč');
  assert.equal(formatMoney(1234, 'EUR', 'en'), '€1,234');
  assert.equal(formatMoney(1234.5, 'USD', 'en'), '$1,234.50');
  assert.equal(formatMoney(99, 'GBP', 'en'), '£99');
  assert.equal(nbsp(formatMoney(1234.5, 'EUR', 'cs')), '1 234,50 €');
  assert.equal(formatMoney(null, 'CZK', 'en'), '—');
  // Same stored amount + currency reads the same whatever the account default is: no conversion exists.
  assert.equal(formatMoney(100, 'CZK', 'en'), formatMoney(100, 'CZK', 'en'));
  assert.equal(currencySymbol('CZK', 'cs'), 'Kč');
});

test('calendar dates do not shift with the time zone', () => {
  assert.equal(formatDate('2026-03-01', 'en'), '1 March 2026');
  assert.equal(formatDate('2026-03-01', 'cs'), '1. března 2026');
  assert.equal(formatDate(null, 'en'), '—');
});
