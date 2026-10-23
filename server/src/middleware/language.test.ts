import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanguage } from './language';

test('English is the default', () => {
  assert.equal(resolveLanguage(undefined), 'en');
  assert.equal(resolveLanguage(''), 'en');
  assert.equal(resolveLanguage('fr-FR,de;q=0.8'), 'en');
  assert.equal(resolveLanguage('*'), 'en');
});

test('Czech is recognised, with regions and weights', () => {
  assert.equal(resolveLanguage('cs'), 'cs');
  assert.equal(resolveLanguage('cs-CZ'), 'cs');
  assert.equal(resolveLanguage('CS-cz,en;q=0.5'), 'cs');
  assert.equal(resolveLanguage('en;q=0.4, cs;q=0.9'), 'cs');
  assert.equal(resolveLanguage('en-GB,cs;q=0.5'), 'en');
  assert.equal(resolveLanguage('cs;q=0'), 'en');
  assert.equal(resolveLanguage('cs;q=abc, en'), 'en');
});
