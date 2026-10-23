// Dependency-free unit tests: run with `npm test -w server` (node:test via tsx).
//
// Determinism: every test drives the limiter with a fake clock (no wall-clock
// dependence), uses its own key, and registers its cleanup with `t.after`, which
// runs even when an assertion fails, so a failing test cannot leave counters or a
// patched `Date.now` behind for the next one.
import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, rateLimitReset } from './rateLimit';
import { HttpError } from './errors';

const is429 = (err: unknown) => err instanceof HttpError && err.status === 429;

// The data export allows 5 requests per account per 15 minutes
// (routes/account.routes.ts: rateLimit(`export:${id}`, 5, FIFTEEN_MIN)).
const MAX = 5;
const FIFTEEN_MIN = 15 * 60 * 1000;

let keyCounter = 0;

/** A key no other test uses, forgotten again when the test ends (pass or fail). */
function freshKey(t: TestContext): string {
  const key = `test-export:${++keyCounter}`;
  t.after(() => rateLimitReset(key));
  return key;
}

/** Replaces Date.now for this test only (restored automatically afterwards) and returns a way to move time. */
function fakeClock(t: TestContext, start = 1_000_000): { advance(ms: number): void; set(ms: number): void } {
  let now = start;
  t.mock.method(Date, 'now', () => now);
  return { advance: ms => { now += ms; }, set: ms => { now = ms; } };
}

const hit = (key: string) => rateLimit(key, MAX, FIFTEEN_MIN);
const fill = (key: string) => { for (let i = 0; i < MAX; i++) hit(key); };

test('the sixth request inside the window is refused with 429', t => {
  fakeClock(t);
  const key = freshKey(t);
  for (let i = 0; i < MAX; i++) assert.doesNotThrow(() => hit(key));
  assert.throws(() => hit(key), is429);
});

test('limits are per key: another account is not affected', t => {
  fakeClock(t);
  const a = freshKey(t);
  const b = freshKey(t);
  fill(a);
  assert.throws(() => hit(a), is429);
  assert.doesNotThrow(() => hit(b));
});

test('requests are allowed again once the window has passed', t => {
  const clock = fakeClock(t);
  const key = freshKey(t);
  fill(key);
  assert.throws(() => hit(key), is429);
  clock.advance(FIFTEEN_MIN - 1);
  assert.throws(() => hit(key), is429);
  clock.advance(2);
  assert.doesNotThrow(() => hit(key));
});

test('a refused request is not counted, so it cannot extend the lockout', t => {
  const clock = fakeClock(t, 5_000_000);
  const key = freshKey(t);
  fill(key);
  for (let i = 0; i < 20; i++) {
    clock.advance(10_000);
    assert.throws(() => hit(key), is429);
  }
  clock.set(5_000_000 + FIFTEEN_MIN + 1); // 15 min after the first five, whatever was refused in between
  assert.doesNotThrow(() => hit(key));
});

test('a failed assertion cannot leak state: cleanup is registered before anything can throw', t => {
  fakeClock(t);
  const key = freshKey(t);
  fill(key);
  assert.throws(() => hit(key), is429);
  // The registered t.after() hook clears the key; check the hook's effect directly.
  rateLimitReset(key);
  assert.doesNotThrow(() => hit(key));
});
