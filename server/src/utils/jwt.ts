import jwt from 'jsonwebtoken';

export interface AuthTokenPayload {
  userId: number;
  /** Issued-at (seconds), added by jsonwebtoken. Compared against users.password_changed_at. */
  iat?: number;
}

/**
 * Reads and validates JWT_SECRET, throwing if it's missing.
 *
 * This is a function (rather than a bare module-level `if (!SECRET) throw`)
 * so its return type is inferred as the narrowed `string` — the only value
 * a successful return can have, since every path that would leave SECRET
 * as `undefined` throws first. A plain top-level const doesn't carry that
 * narrowing into the closures below (signAuthToken/verifyAuthToken run
 * later, at request time, and TypeScript can't prove the module-level
 * narrowing still holds when they execute) — wrapping it in a function
 * gives SECRET a real, checked `string` type everywhere it's used, with no
 * `as string` cast.
 */
function loadJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Copy server/.env.example to server/.env and fill it in.');
  }
  if (process.env.NODE_ENV === 'production') {
    if (secret === 'change-this-to-a-long-random-string') {
      throw new Error('JWT_SECRET is still the placeholder from .env.example. Set a long random value.');
    }
    if (secret.length < 32) {
      console.warn('JWT_SECRET is shorter than 32 characters; use a long random value in production.');
    }
  }
  return secret;
}

// Evaluated once, at module load — i.e. at server startup, before any
// request is handled. A missing JWT_SECRET fails the process immediately
// and clearly, rather than surfacing later on the first sign/verify call.
const SECRET: string = loadJwtSecret();

const EXPIRES_IN = '30d';

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign({ userId: payload.userId }, SECRET, { expiresIn: EXPIRES_IN, algorithm: 'HS256' });
}

/**
 * Runtime type guard for the decoded JWT payload. jwt.verify()'s return
 * type (JwtPayload | string, per @types/jsonwebtoken) is intentionally
 * wide because a JWT can carry anything — this checks, at runtime, that
 * what came back actually has the shape this app relies on before it's
 * ever treated as an AuthTokenPayload. No `as AuthTokenPayload` cast.
 */
function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).userId === 'number'
  );
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded: unknown = jwt.verify(token, SECRET, { algorithms: ['HS256'] });
  if (!isAuthTokenPayload(decoded)) {
    throw new Error('Auth token payload is missing or malformed');
  }
  return decoded;
}

export const AUTH_COOKIE_NAME = 'wii_token';

export const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
