import test from 'node:test';
import assert from 'node:assert/strict';
import { pathFor } from './format';
import type { Location } from '../types';

const loc = (id: number, name: string, parentId: number | null) => ({ id, name, parentId, userId: 1 }) as Location;

test('pathFor builds the chain from the top place down', () => {
  const all = [loc(1, 'Home', null), loc(2, 'Garage', 1)];
  assert.deepEqual(pathFor(2, all).map(l => l.name), ['Home', 'Garage']);
  assert.deepEqual(pathFor(null, all), []);
});

test('pathFor terminates on a parent cycle', () => {
  const all = [loc(1, 'A', 2), loc(2, 'B', 1)];
  assert.deepEqual(pathFor(1, all).map(l => l.name), ['B', 'A']);
});
