import { Request, Response, NextFunction } from 'express';
import { pool } from '../db/pool';
import { verifyAuthToken, AUTH_COOKIE_NAME } from '../utils/jwt';
import { emailNotVerified, sessionExpired } from '../utils/errors';
import { asyncHandler } from '../utils/asyncHandler';
import { mapUserRow, USER_SELECT_COLUMNS } from '../db/mappers';

/**
 * Reads the auth cookie, verifies the JWT, and loads the current user onto
 * req.user. Responds 401 if missing/invalid. All /api routes except
 * /api/auth/register and /api/auth/login sit behind this.
 *
 * A token is also rejected if it was issued before the user's last password
 * change (users.password_changed_at, migration 0005), which is how a password
 * change ends every other session of the account.
 */
export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) throw sessionExpired('Not signed in');

  let payload;
  try {
    payload = verifyAuthToken(token);
  } catch {
    throw sessionExpired();
  }

  const { rows } = await pool.query(
    `SELECT ${USER_SELECT_COLUMNS}, password_changed_at FROM users WHERE id = $1`,
    [payload.userId]
  );
  if (rows.length === 0) throw sessionExpired('This account no longer exists');

  const changedAt: Date | null = rows[0].password_changed_at;
  if (changedAt) {
    const changedSeconds = Math.floor(changedAt.getTime() / 1000);
    if (payload.iat === undefined || payload.iat < changedSeconds) {
      throw sessionExpired('Your password was changed. Please sign in again.');
    }
  }

  req.user = mapUserRow(rows[0]);
  next();
});

/**
 * Gate for everything that exposes or changes a person's belongings. A signed-in
 * account whose email has not been confirmed can reach only the auth and
 * account endpoints (verify, resend, change email, sign out, delete account).
 * The check reads the flag loaded from the database by requireAuth, so it
 * cannot be influenced by anything the client sends.
 */
export function requireVerified(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.emailVerified) return next(emailNotVerified());
  next();
}
