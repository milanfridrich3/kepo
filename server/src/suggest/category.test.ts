import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestCategory, normalizeText } from './category';

test('normalizeText strips diacritics and punctuation', () => {
  assert.equal(normalizeText('  Žluťoučký KŮŇ!! '), 'zlutoucky kun');
});

test('suggests from English and Czech names', () => {
  const c = (name: string, rest = {}) => suggestCategory({ name, ...rest })?.category ?? null;
  assert.equal(c('Bosch cordless drill'), 'Tools');
  assert.equal(c('Aku vrtačka'), 'Tools');
  assert.equal(c('MacBook laptop'), 'Electronics');
  assert.equal(c('Sluchátka Sony'), 'Electronics');
  assert.equal(c('Zimní bunda'), 'Clothing');
  assert.equal(c('Horské kolo'), 'Sports');
  assert.equal(c('Román Babička'), 'Books');
  assert.equal(c('Hodinky Casio'), 'Accessories');
  assert.equal(c('Vysavač Dyson'), 'Household');
  assert.equal(c('Sběratelská figurka'), 'Collectibles');
  assert.equal(c('Thing', { tags: ['garage', 'drill'] }), 'Tools');
});

test('returns null when nothing matches and does not match inside other words', () => {
  assert.equal(suggestCategory({ name: 'Something odd' }), null);
  assert.equal(suggestCategory({}), null);
  assert.equal(suggestCategory({ name: 'Stvol' }), null);       // "tv" must not match inside a word
  assert.equal(suggestCategory({ name: 'Hamster' }), null);     // "ham"... nothing
});

test('is deterministic and reports the matched keyword', () => {
  const a = suggestCategory({ name: 'Red laptop bag' });
  assert.deepEqual(a, suggestCategory({ name: 'Red laptop bag' }));
  assert.equal(a?.matched, 'laptop');
});
