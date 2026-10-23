import type { Response } from 'express';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_MS } from './jwt';

/**
 * The one definition of the auth cookie's attributes, used both to set it and
 * to clear it. A browser only treats a clearing Set-Cookie as the same cookie
 * when Path/SameSite/Secure match, and in production (API and client on
 * different sites) a Set-Cookie without `SameSite=None; Secure` can be
 * rejected outright — so clearing must repeat exactly what setting used.
 */
function baseOptions() {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    // Locally, the frontend (localhost:5173) and API (localhost:4000) share
    // the "localhost" site, so Lax is correct there. In production they are
    // different *.onrender.com sites (a public suffix), so the cookie needs
    // SameSite=None, which browsers only accept together with Secure.
    sameSite: isProd ? ('none' as const) : ('lax' as const),
    secure: isProd,
    path: '/',
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE_NAME, token, { ...baseOptions(), maxAge: AUTH_COOKIE_MAX_AGE_MS });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE_NAME, baseOptions());
}
