import { Router } from 'express';
import { randomBytes } from 'crypto';
import { pool, withTransaction } from '../db/pool';
import { hashPassword, verifyPassword } from '../utils/password';
import { signAuthToken } from '../utils/jwt';
import { setAuthCookie, clearAuthCookie } from '../utils/cookies';
import { asyncHandler } from '../utils/asyncHandler';
import { badRequest, conflict, HttpError, unauthorized } from '../utils/errors';
import { rateLimit, rateLimitReset } from '../utils/rateLimit';
import {
  parseEmail,
  parseNewPassword,
  parseOptionalCurrency,
  parseOptionalLanguage,
  parseRequiredString,
} from '../utils/validation';
import { requireAuth } from '../middleware/auth';
import { mapUserRow, USER_SELECT_COLUMNS } from '../db/mappers';
import { defaultCurrencyForLanguage } from '../types';
import type { VerificationInfo } from '../types';
import { emailVerificationRequired, resendCooldownMs } from '../config';
import { isWellFormedResetToken, isWellFormedVerificationCode } from '../auth/codes';
import { isResetTokenUsable, resetPasswordWithToken, verifyEmailCode } from '../auth/store';
import {
  createVerificationCode,
  deliverVerificationCode,
  resendVerification,
  startPasswordReset,
} from '../auth/emailFlows';
import { sendPasswordChangedEmail, sendWelcomeEmail } from '../email/mailer';
import { withMinDuration } from '../utils/timing';

export const authRouter = Router();

const FIFTEEN_MIN = 15 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

// Hash compared against when the email is unknown, so "no such account" and
// "wrong password" take the same time and cannot be told apart by timing.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

const RESET_LINK_INVALID = 'This reset link is invalid or has expired. Request a new one.';

authRouter.post('/register', asyncHandler(async (req, res) => {
  rateLimit(`register:${req.ip}`, 10, ONE_HOUR);

  const { email, password, name } = req.body ?? {};
  const normalizedEmail = parseEmail(email);
  const validPassword = parseNewPassword(password);
  const displayName = parseRequiredString(name, 'Name', 120);
  // Language: explicit choice, else the language the browser/app asked in.
  // Currency: explicit choice, else the default for that language. The two
  // are independent afterwards.
  const language = parseOptionalLanguage(req.body?.language) ?? req.lang;
  const currency = parseOptionalCurrency(req.body?.currency) ?? defaultCurrencyForLanguage(language);
  const mustVerify = emailVerificationRequired();

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (existing.rows.length > 0) throw conflict('An account with that email already exists');

  const passwordHash = await hashPassword(validPassword);

  // User, default location and verification code are committed together:
  // a failure partway through must not leave a user with no location or no
  // code. A concurrent registration with the same email hits the UNIQUE index
  // (23505), reported as the same 409 as the check above.
  const created = await withTransaction(async client => {
    try {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, name, language, currency, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN NULL ELSE now() END)
         RETURNING ${USER_SELECT_COLUMNS}`,
        [normalizedEmail, passwordHash, displayName, language, currency, mustVerify]
      );
      const user = mapUserRow(rows[0]);
      await client.query('INSERT INTO locations (user_id, name, parent_id) VALUES ($1, $2, NULL)', [
        user.id,
        language === 'cs' ? 'Domov' : 'Home',
      ]);
      const ref = { id: user.id, email: user.email, name: user.name, language: user.language };
      const issued = mustVerify ? await createVerificationCode(client, ref) : null;
      return { user, ref, issued };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw conflict('An account with that email already exists');
      throw err;
    }
  });

  // Emails go out after the commit. A delivery problem never fails the
  // registration: the account exists and the user can request a new code.
  let emailSent = false;
  if (created.issued) {
    emailSent = await deliverVerificationCode(created.ref, created.issued.code, created.issued.id);
  }
  void sendWelcomeEmail(created.ref, created.user.id);

  const verification: VerificationInfo = {
    required: mustVerify,
    emailSent,
    retryAfterSeconds: emailSent ? Math.ceil(resendCooldownMs() / 1000) : 0,
  };
  setAuthCookie(res, signAuthToken({ userId: created.user.id }));
  res.status(201).json({ user: created.user, verification });
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') throw badRequest('Email and password are required');
  if (email.length > 254 || password.length > 1024) throw unauthorized('Incorrect email or password');

  const normalizedEmail = email.trim().toLowerCase();
  // Two windows: a broad per-IP cap, and a tighter cap per (IP, account) so
  // one address cannot hammer a single account. Keyed by IP+email (not email
  // alone) so a stranger cannot lock the real owner out.
  rateLimit(`login-ip:${req.ip}`, 30, FIFTEEN_MIN);
  const accountKey = `login:${req.ip}:${normalizedEmail}`;
  rateLimit(accountKey, 8, FIFTEEN_MIN);

  const { rows } = await pool.query(
    `SELECT ${USER_SELECT_COLUMNS}, password_hash FROM users WHERE email = $1`,
    [normalizedEmail]
  );
  const hash = rows.length > 0 ? rows[0].password_hash : await DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  if (rows.length === 0 || !ok) throw unauthorized('Incorrect email or password');

  rateLimitReset(accountKey);
  const user = mapUserRow(rows[0]);
  setAuthCookie(res, signAuthToken({ userId: user.id }));
  res.json({ user });
}));

authRouter.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---- Email verification (signed in, address not yet confirmed) ----

authRouter.post('/verify-email', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  if (user.emailVerified) {
    res.json({ user });
    return;
  }
  rateLimit(`verify:${user.id}`, 12, FIFTEEN_MIN);

  const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\s+/g, '') : req.body?.code;
  if (!isWellFormedVerificationCode(code)) throw badRequest('Enter the 6-digit code from the email.', 'code_malformed');

  const outcome = await verifyEmailCode(user.id, code);
  switch (outcome) {
    case 'ok': {
      const { rows } = await pool.query(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = $1`, [user.id]);
      res.json({ user: mapUserRow(rows[0]) });
      return;
    }
    case 'mismatch':
      throw badRequest('That code is not correct.', 'code_incorrect');
    case 'expired':
      throw badRequest('That code has expired. Request a new one.', 'code_expired');
    case 'locked':
      throw badRequest('Too many incorrect attempts. Request a new code.', 'code_locked');
    default:
      throw badRequest('There is no active code. Request a new one.', 'code_missing');
  }
}));

authRouter.post('/resend-verification', requireAuth, asyncHandler(async (req, res) => {
  const user = req.user!;
  if (user.emailVerified) {
    res.json({ retryAfterSeconds: 0 });
    return;
  }
  rateLimit(`resend:${user.id}`, 6, ONE_HOUR);
  const { retryAfterSeconds } = await resendVerification({ id: user.id, email: user.email, name: user.name, language: user.language });
  res.json({ retryAfterSeconds });
}));

// ---- Password recovery (public) ----

// Same answer and similar timing whether or not the address has an account.
authRouter.post('/forgot-password', asyncHandler(async (req, res) => {
  rateLimit(`forgot-ip:${req.ip}`, 20, ONE_HOUR);
  const raw = req.body?.email;
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  // A malformed address gets the same generic answer as an unknown one.
  if (email.length > 0 && email.length <= 254) rateLimit(`forgot:${req.ip}:${email}`, 4, FIFTEEN_MIN);

  await withMinDuration(400, async () => {
    if (!email || email.length > 254) return;
    const { rows } = await pool.query('SELECT id, email, name, language FROM users WHERE email = $1', [email]);
    if (rows.length === 0) return;
    await startPasswordReset(rows[0]);
  });
  res.status(202).json({ ok: true });
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  rateLimit(`reset-ip:${req.ip}`, 20, FIFTEEN_MIN);

  const { token, newPassword } = req.body ?? {};
  if (!isWellFormedResetToken(token)) throw new HttpError(400, RESET_LINK_INVALID, 'reset_token_invalid');
  const validPassword = parseNewPassword(newPassword, 'New password');
  // Invalid or expired links are rejected before spending a bcrypt hash.
  if (!(await isResetTokenUsable(token))) throw new HttpError(400, RESET_LINK_INVALID, 'reset_token_invalid');

  const owner = await resetPasswordWithToken(token, await hashPassword(validPassword));
  if (!owner) throw new HttpError(400, RESET_LINK_INVALID, 'reset_token_invalid');

  void sendPasswordChangedEmail(
    { email: owner.email, name: owner.name, language: owner.language },
    owner.userId,
    Date.now()
  );
  // Every session, including this browser's, ended with the password change.
  clearAuthCookie(res);
  res.status(204).end();
}));
