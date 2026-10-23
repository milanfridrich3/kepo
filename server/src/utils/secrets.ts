import { deriveCodeKey } from '../auth/codes';

let cached: Buffer | null = null;

/** HMAC key for stored codes/tokens, derived once from JWT_SECRET (already validated at startup by utils/jwt.ts). */
export function codeKey(): Buffer {
  if (!cached) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not set.');
    cached = deriveCodeKey(secret);
  }
  return cached;
}
