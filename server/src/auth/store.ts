import type { QueryResult } from 'pg';
import { pool, withTransaction } from '../db/pool';
import { codeKey } from '../utils/secrets';
import { checkCode, hashSecret, hashesEqual, MAX_CODE_ATTEMPTS } from './codes';
import type { CodeCheck, CodePurpose } from './codes';
import type { Language } from '../types';

/** Anything that can run a query: the shared pool or a transaction's client. */
export interface Db {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(text: string, values?: any[]): Promise<QueryResult<any>>;
}

/**
 * Stores a new code/token for a user and retires every earlier unused one of
 * the same purpose, so at most one is ever valid. Only the keyed hash is stored.
 */
export async function issueCode(
  db: Db,
  args: { userId: number; purpose: CodePurpose; secret: string; email: string; ttlMs: number }
): Promise<{ id: number }> {
  const hash = hashSecret(codeKey(), args.purpose, args.purpose === 'verify_email' ? args.userId : null, args.secret);
  await db.query(
    'UPDATE auth_codes SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL',
    [args.userId, args.purpose]
  );
  const { rows } = await db.query(
    `INSERT INTO auth_codes (user_id, purpose, secret_hash, target_email, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(secs => $5::double precision))
     RETURNING id`,
    [args.userId, args.purpose, hash, args.email, args.ttlMs / 1000]
  );
  return { id: Number(rows[0].id) };
}

/** Records that the provider accepted the message (starts the resend cooldown). */
export async function markSent(db: Db, id: number): Promise<void> {
  await db.query('UPDATE auth_codes SET sent_at = now() WHERE id = $1', [id]);
}

export async function lastSentAt(db: Db, userId: number, purpose: CodePurpose): Promise<Date | null> {
  const { rows } = await db.query(
    'SELECT max(sent_at) AS sent_at FROM auth_codes WHERE user_id = $1 AND purpose = $2',
    [userId, purpose]
  );
  return rows[0]?.sent_at ?? null;
}

export type VerifyOutcome = CodeCheck | 'none';

/**
 * Checks a presented verification code for `userId` and, if correct, marks the
 * address verified — all in one transaction, so a code can never be used twice
 * and a verified flag is never set without consuming the code. A wrong guess is
 * counted and committed (the attempt counter is what limits brute force).
 */
export function verifyEmailCode(userId: number, code: string): Promise<VerifyOutcome> {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT c.id, c.secret_hash, c.attempts, c.expires_at, c.consumed_at, c.target_email, u.email
       FROM auth_codes c JOIN users u ON u.id = c.user_id
       WHERE c.user_id = $1 AND c.purpose = 'verify_email' AND c.consumed_at IS NULL
       ORDER BY c.id DESC LIMIT 1
       FOR UPDATE OF c`,
      [userId]
    );
    if (rows.length === 0) return 'none';
    const row = rows[0];

    // The code was sent to an address the account no longer has.
    if (row.target_email !== row.email) {
      await db.query('UPDATE auth_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      return 'expired';
    }

    const matches = hashesEqual(row.secret_hash, hashSecret(codeKey(), 'verify_email', userId, code));
    const outcome = checkCode(
      { consumedAt: row.consumed_at, expiresAt: row.expires_at, attempts: row.attempts },
      matches,
      new Date(),
      MAX_CODE_ATTEMPTS
    );

    if (outcome === 'mismatch') {
      await db.query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    } else if (outcome === 'ok') {
      await db.query('UPDATE auth_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      await db.query('UPDATE users SET email_verified_at = now() WHERE id = $1 AND email = $2', [userId, row.target_email]);
    }
    return outcome;
  });
}

export interface ResetOwner {
  userId: number;
  email: string;
  name: string;
  language: Language;
}

/** Cheap, read-only test of whether a reset token is currently usable (so an invalid one never costs a bcrypt hash). */
export async function isResetTokenUsable(token: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM auth_codes c JOIN users u ON u.id = c.user_id
     WHERE c.secret_hash = $1 AND c.purpose = 'reset_password' AND c.consumed_at IS NULL
       AND c.expires_at > now() AND c.target_email = u.email`,
    [hashSecret(codeKey(), 'reset_password', null, token)]
  );
  return rows.length > 0;
}

/**
 * Spends a reset token and sets the new password in one transaction. The token
 * is re-validated under a row lock, so two simultaneous uses cannot both win.
 * On success every other outstanding code of the account is retired,
 * `password_changed_at` ends all existing sessions, and the address counts as
 * verified (the link was delivered to it). Returns null if the token is unusable.
 */
export function resetPasswordWithToken(token: string, passwordHash: string): Promise<ResetOwner | null> {
  return withTransaction(async db => {
    const { rows } = await db.query(
      `SELECT c.id, c.expires_at, c.consumed_at, c.target_email, u.id AS user_id, u.email, u.name, u.language
       FROM auth_codes c JOIN users u ON u.id = c.user_id
       WHERE c.secret_hash = $1 AND c.purpose = 'reset_password'
       FOR UPDATE OF c`,
      [hashSecret(codeKey(), 'reset_password', null, token)]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    const outcome = checkCode({ consumedAt: row.consumed_at, expiresAt: row.expires_at, attempts: 0 }, true, new Date());
    if (outcome !== 'ok' || row.target_email !== row.email) return null;

    await db.query(
      `UPDATE users SET password_hash = $1, password_changed_at = now(),
              email_verified_at = COALESCE(email_verified_at, now())
       WHERE id = $2`,
      [passwordHash, row.user_id]
    );
    await db.query('UPDATE auth_codes SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL', [row.user_id]);
    return { userId: row.user_id, email: row.email, name: row.name, language: row.language };
  });
}
