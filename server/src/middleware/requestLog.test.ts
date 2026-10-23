import test from 'node:test';
import assert from 'node:assert/strict';
import { safePath, formatRequestLog } from './requestLog';

test('query strings and fragments are never logged', () => {
  assert.equal(safePath('/api/items?q=secret+thing&token=abc'), '/api/items');
  assert.equal(safePath('/api/items/5#x'), '/api/items/5');
});
test('calendar feed secret is redacted', () => {
  assert.equal(safePath('/api/calendar/' + 'A'.repeat(43) + '.ics'), '/api/calendar/:token');
  assert.ok(!formatRequestLog('GET', '/api/calendar/' + 'A'.repeat(43) + '.ics?x=1', 200, 3).includes('AAAA'));
});
test('line format', () => {
  assert.equal(formatRequestLog('GET', '/api/items?q=1', 200, 12.4), 'GET /api/items 200 12ms');
});
