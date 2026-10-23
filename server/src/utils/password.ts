import bcrypt from 'bcryptjs';

// bcryptjs (pure JS) instead of native bcrypt: no build toolchain required
// to install it, which keeps setup simple for an MVP. Cost factor 12 is a
// reasonable default for 2026-era hardware.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
