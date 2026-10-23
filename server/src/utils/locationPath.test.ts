import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPathResolver } from './locationPath';

const loc = (id: number, name: string, parent_id: number | null) => ({ id, name, parent_id });

test('builds a nested path and handles unassigned / unknown ids', () => {
  const path = buildPathResolver([loc(1, 'Home', null), loc(2, 'Garage', 1), loc(3, 'Shelf', 2)]);
  assert.equal(path(3), 'Home → Garage → Shelf');
  assert.equal(path(1), 'Home');
  assert.equal(path(null), 'Unassigned');
  assert.equal(path(99), 'Unassigned');
});

test('terminates on a parent cycle instead of looping forever', () => {
  const path = buildPathResolver([loc(1, 'A', 2), loc(2, 'B', 1)]);
  assert.equal(path(1), 'B → A');
  assert.equal(path(2), 'A → B');
});

test('terminates on a place that is its own parent', () => {
  assert.equal(buildPathResolver([loc(1, 'Loop', 1)])(1), 'Loop');
});
