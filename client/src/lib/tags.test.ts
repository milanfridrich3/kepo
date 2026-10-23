import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTagInput, formatTagInput } from './tags';

test('splits, trims, dedupes ignoring case, keeps first spelling', () => {
  assert.deepEqual(parseTagInput(' Garage, tools ;garage\n  blue  sky , ,'), ['Garage', 'tools', 'blue sky']);
  assert.deepEqual(parseTagInput(''), []);
  assert.equal(formatTagInput(['a', 'b']), 'a, b');
});
