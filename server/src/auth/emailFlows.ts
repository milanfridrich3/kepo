import { pool } from '../db/pool';
import { resendCooldownMs, resetTokenTtlMs, verificationCodeTtlMs } from '../config';
import { emailDeliveryFailed, tooSoon } from '../utils/errors';
import { cooldownRemainingSeconds, generateResetToken, generateVerificationCode } from './codes';
import { issueCode, lastSentAt, markSent } from './store';
import type { Db } from './store';
import { sendPasswordResetEmail, sendVerificationEmail } from '../email/mailer';
import type { Recipient } from '../email/mailer';

/**
 * Orchestration of the two emailed secrets. Route handlers stay thin and the
 * rules (cooldown, "sent_at only after the provider accepted it") live here.
 * Neither the code nor the token is ever logged.
 */

export interface AccountRef extends Recipient {
  id: number;
}

/** Creates (and stores the hash of) a fresh verification code. The caller emails it after its transaction commits. */
export async function createVerificationCode(db: Db, user: AccountRef): Promise<{ code: string; id: number }> {
  const code = generateVerificationCode();
  const { id } = await issueCode(db, {
    userId: user.id,
    purpose: 'verify_email',
    secret: code,
    email: user.email,
    ttlMs: verificationCodeTtlMs(),
  });
  return { code, id };
}

/** Emails a stored code; the resend cooldown only starts once the provider accepted the message. */
export async function deliverVerificationCode(user: AccountRef, code: string, id: number): Promise<boolean> {
  const result = await sendVerificationEmail(user, code, id);
  if (result.ok) await markSent(pool, id);
  return result.ok;
}

export async function verificationCooldownSeconds(userId: number): Promise<number> {
  return cooldownRemainingSeconds(await lastSentAt(pool, userId, 'verify_email'), new Date(), resendCooldownMs());
}

/** Explicit "send me a new code". Enforces the cooldown on the server. */
export async function resendVerification(user: AccountRef): Promise<{ retryAfterSeconds: number }> {
  const wait = await verificationCooldownSeconds(user.id);
  if (wait > 0) throw tooSoon(wait);
  const { code, id } = await createVerificationCode(pool, user);
  if (!(await deliverVerificationCode(user, code, id))) throw emailDeliveryFailed();
  return { retryAfterSeconds: Math.ceil(resendCooldownMs() / 1000) };
}

/**
 * Starts password recovery for an existing account. Returns quietly when the
 * cooldown is still running (the caller answers identically either way).
 * The email itself is sent without being awaited, so response time does not
 * depend on the provider.
 */
export async function startPasswordReset(user: AccountRef): Promise<void> {
  const last = await lastSentAt(pool, user.id, 'reset_password');
  if (cooldownRemainingSeconds(last, new Date(), resendCooldownMs()) > 0) return;
  const token = generateResetToken();
  const { id } = await issueCode(pool, {
    userId: user.id,
    purpose: 'reset_password',
    secret: token,
    email: user.email,
    ttlMs: resetTokenTtlMs(),
  });
  void sendPasswordResetEmail(user, token, id)
    .then(result => (result.ok ? markSent(pool, id) : undefined))
    .catch(() => console.error('[email] reset_password: post-send bookkeeping failed'));
}
