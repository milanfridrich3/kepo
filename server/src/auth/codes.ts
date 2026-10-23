import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

/**
 * Pure helpers for one-time email codes and password-reset tokens: generation,
 * keyed hashing and the decision of whether a presented secret is acceptable.
 * Nothing here touches the database or the clock on its own, so every rule can
 * be unit-tested (see codes.test.ts); store.ts applies them to real rows.
 */

export type CodePurpose = 'verify_email' | 'reset_password';

/** Wrong guesses allowed against one verification code before it is locked. */
export const MAX_CODE_ATTEMPTS = 5;

/** 6 digits from a cryptographically secure source (uniform, no modulo bias). */
export function generateVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** 256 bits of randomness, URL-safe (43 characters). */
export function generateResetToken(): string {
  return randomBytes(32).toString('base64url');
}

export const isWellFormedVerificationCode = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{6}$/.test(value);

export const isWellFormedResetToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

/** Derives the HMAC key from the server's signing secret, namespaced so it can never equal the JWT key. */
export function deriveCodeKey(serverSecret: string): Buffer {
  return createHash('sha256').update(`kepo:auth-codes:v1:${serverSecret}`).digest();
}

/**
 * Keyed hash of a secret. A user id binds a verification code to its owner
 * (the same six digits issued to two people hash differently); reset tokens
 * are looked up by hash alone, so they pass `null`.
 */
export function hashSecret(key: Buffer, purpose: CodePurpose, userId: number | null, secret: string): string {
  return createHmac('sha256', key).update(`${purpose}:${userId ?? ''}:${secret}`).digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function hashesEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export interface CodeState {
  consumedAt: Date | null;
  expiresAt: Date;
  attempts: number;
}

export type CodeCheck = 'ok' | 'consumed' | 'expired' | 'locked' | 'mismatch';

/**
 * Decides the outcome for a presented secret. Order matters: a used or expired
 * code is never "unlocked" by a correct guess, and a locked code (too many
 * wrong attempts) rejects even the right secret, which is what stops brute force.
 */
export function checkCode(state: CodeState, matches: boolean, now: Date, maxAttempts = MAX_CODE_ATTEMPTS): CodeCheck {
  if (state.consumedAt) return 'consumed';
  if (state.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (state.attempts >= maxAttempts) return 'locked';
  return matches ? 'ok' : 'mismatch';
}

/** Whole seconds still to wait before another email may be sent (0 = go ahead). */
export function cooldownRemainingSeconds(lastSentAt: Date | null, now: Date, cooldownMs: number): number {
  if (!lastSentAt) return 0;
  const remaining = lastSentAt.getTime() + cooldownMs - now.getTime();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
