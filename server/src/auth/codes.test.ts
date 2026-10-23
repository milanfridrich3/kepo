import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCode, cooldownRemainingSeconds, deriveCodeKey, generateResetToken, generateVerificationCode,
  hashesEqual, hashSecret, isWellFormedResetToken, isWellFormedVerificationCode, MAX_CODE_ATTEMPTS,
} from './codes';

const key = deriveCodeKey('a-test-secret-of-sufficient-length-0123456789');
const now = new Date('2026-01-01T12:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);

test('verification codes are 6 digits and well-formed', () => {
  for (let i = 0; i < 200; i++) assert.match(generateVerificationCode(), /^\d{6}$/);
  assert.ok(isWellFormedVerificationCode('012345'));
  for (const bad of ['12345', '1234567', 'abcdef', '12 345', '', null, undefined, 123456]) {
    assert.equal(isWellFormedVerificationCode(bad), false);
  }
});

test('reset tokens are 43 URL-safe chars and unique', () => {
  const a = generateResetToken();
  const b = generateResetToken();
  assert.ok(isWellFormedResetToken(a));
  assert.notEqual(a, b);
  assert.equal(isWellFormedResetToken('short'), false);
  assert.equal(isWellFormedResetToken(`${a}x`), false);
  assert.equal(isWellFormedResetToken(`${a.slice(0, 42)}+`), false);
});

test('hashing is deterministic, keyed, purpose- and user-bound, and never contains the secret', () => {
  const h = hashSecret(key, 'verify_email', 7, '123456');
  assert.equal(h, hashSecret(key, 'verify_email', 7, '123456'));
  assert.notEqual(h, hashSecret(key, 'verify_email', 8, '123456'));
  assert.notEqual(h, hashSecret(key, 'reset_password', 7, '123456'));
  assert.notEqual(h, hashSecret(deriveCodeKey('another-secret-another-secret-123456'), 'verify_email', 7, '123456'));
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes('123456'));
});

test('the code key differs from the raw server secret', () => {
  const secret = 'a-test-secret-of-sufficient-length-0123456789';
  assert.notEqual(deriveCodeKey(secret).toString('utf8'), secret);
});

test('hashesEqual is exact and tolerates different lengths', () => {
  const h = hashSecret(key, 'reset_password', null, 'token');
  assert.ok(hashesEqual(h, h));
  assert.equal(hashesEqual(h, hashSecret(key, 'reset_password', null, 'other')), false);
  assert.equal(hashesEqual(h, h.slice(0, 10)), false);
  assert.equal(hashesEqual('', ''), false);
});

test('checkCode: ok, mismatch, expired, consumed, locked — in the documented precedence', () => {
  const fresh = { consumedAt: null, expiresAt: later(60_000), attempts: 0 };
  assert.equal(checkCode(fresh, true, now), 'ok');
  assert.equal(checkCode(fresh, false, now), 'mismatch');
  assert.equal(checkCode({ ...fresh, expiresAt: later(-1) }, true, now), 'expired');
  assert.equal(checkCode({ ...fresh, expiresAt: now }, true, now), 'expired', 'expiry instant itself is expired');
  assert.equal(checkCode({ ...fresh, consumedAt: now }, true, now), 'consumed');
  assert.equal(checkCode({ ...fresh, attempts: MAX_CODE_ATTEMPTS }, true, now), 'locked', 'right code is refused once locked');
  assert.equal(checkCode({ ...fresh, attempts: MAX_CODE_ATTEMPTS - 1 }, true, now), 'ok');
  assert.equal(checkCode({ consumedAt: now, expiresAt: later(-1), attempts: 99 }, true, now), 'consumed');
});

test('cooldownRemainingSeconds rounds up and ends at zero', () => {
  assert.equal(cooldownRemainingSeconds(null, now, 60_000), 0);
  assert.equal(cooldownRemainingSeconds(now, now, 60_000), 60);
  assert.equal(cooldownRemainingSeconds(later(-59_500), now, 60_000), 1);
  assert.equal(cooldownRemainingSeconds(later(-60_000), now, 60_000), 0);
  assert.equal(cooldownRemainingSeconds(later(-120_000), now, 60_000), 0);
});
