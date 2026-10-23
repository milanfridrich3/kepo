import { badRequest } from './errors';
import { STATUSES, ItemStatus, isCurrency, isLanguage } from '../types';
import type { Currency, Language } from '../types';

/**
 * Parses a route param (e.g. req.params.id) as a positive integer.
 * Throws a 400 HttpError for anything that isn't one, instead of letting
 * a non-numeric id (a stale link, a typo, `NaN`) reach PostgreSQL and
 * surface as an unhandled type-cast error (500). Also rejects ids beyond
 * PostgreSQL's INTEGER range, which would otherwise be a 500 too.
 */
const MAX_PG_INT = 2147483647;

export function parseRouteId(raw: string, label = 'id'): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > MAX_PG_INT) {
    throw badRequest(`Invalid ${label}`);
  }
  return n;
}

/**
 * Parses an optional foreign-key field from a request body.
 * - `undefined` (field not present at all) is returned as `undefined`, so
 *   callers can distinguish "not supplied" from "explicitly cleared".
 * - `null` (explicitly clearing/unassigning) is returned as `null`.
 * - Anything else must be a positive integer, or a 400 is thrown.
 */
export function parseOptionalId(raw: unknown, label: string): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n <= 0 || n > MAX_PG_INT) {
    throw badRequest(`Invalid ${label}`);
  }
  return n;
}

/** Required, trimmed, length-limited string. */
export function parseRequiredString(raw: unknown, label: string, max: number): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) throw badRequest(`${label} is required`);
  const value = raw.trim();
  if (value.length > max) throw badRequest(`${label} must be ${max} characters or fewer`);
  return value;
}

/** Optional string: undefined/null/blank → null, otherwise trimmed and length-limited. */
export function parseOptionalString(raw: unknown, label: string, max: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw badRequest(`${label} must be text`);
  const value = raw.trim();
  if (value.length === 0) return null;
  if (value.length > max) throw badRequest(`${label} must be ${max} characters or fewer`);
  return value;
}

/** Optional calendar date. Accepts only a real "YYYY-MM-DD" date (no 2026-02-31); blank → null. */
export function parseOptionalDate(raw: unknown, label: string): string | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw badRequest(`${label} must be a valid date`);
  }
  const [y, m, d] = raw.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  const real = probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
  if (!real || y < 1900 || y > 2100) throw badRequest(`${label} must be a valid date`);
  return raw;
}

const MAX_MONEY = 9999999999.99; // NUMERIC(12,2)

/** Optional non-negative amount with at most 2 decimals' worth of precision; blank → null. */
export function parseOptionalMoney(raw: unknown, label: string): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) {
    throw badRequest(`${label} must be a number between 0 and ${MAX_MONEY.toLocaleString('en-US')}`);
  }
  return Math.round(n * 100) / 100;
}

/** Optional http(s) URL (the legacy external photo link). Blank → null. */
export function parseOptionalHttpUrl(raw: unknown, label: string, max = 2048): string | null {
  const value = parseOptionalString(raw, label, max);
  if (value === null) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest(`${label} must be a valid web address`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest(`${label} must start with http:// or https://`);
  }
  return value;
}

export function isItemStatus(value: unknown): value is ItemStatus {
  return typeof value === 'string' && (STATUSES as string[]).includes(value);
}

/** Normalised, validated email address. */
export function parseEmail(raw: unknown): string {
  if (typeof raw !== 'string') throw badRequest('A valid email is required');
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw badRequest('A valid email is required');
  }
  return email;
}

/**
 * New-password rules. bcrypt only reads the first 72 bytes, so a longer
 * password would be silently truncated; refuse it instead of pretending.
 */
export function parseNewPassword(raw: unknown, label = 'Password'): string {
  if (typeof raw !== 'string' || raw.length < 8) throw badRequest(`${label} must be at least 8 characters`);
  if (Buffer.byteLength(raw, 'utf8') > 72) throw badRequest(`${label} must be 72 bytes or fewer`);
  return raw;
}

/** Escapes LIKE/ILIKE wildcards so user text is matched literally (PostgreSQL's default escape is backslash). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/** Optional interface language; absent means "not supplied" (undefined), anything else must be supported. */
export function parseOptionalLanguage(raw: unknown): Language | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (!isLanguage(raw)) throw badRequest('Language must be one of: en, cs');
  return raw;
}

/** Optional currency code; absent means "not supplied" (undefined), anything else must be supported. */
export function parseOptionalCurrency(raw: unknown): Currency | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (!isCurrency(raw)) throw badRequest('Currency must be one of: CZK, EUR, USD, GBP');
  return raw;
}

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** Optional piece count: whole number 1..9999. undefined/null/blank = "not supplied" (undefined). */
export function parseQuantity(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 9999) throw badRequest('Quantity must be a whole number from 1 to 9999');
  return n;
}

/** Splits "a; b, c" typed in one text field (or one CSV cell) into separate tag candidates. */
export function splitTagText(text: string): string[] {
  return text.split(/[;,]/);
}

/**
 * Item tags: at most 10, each at most 30 characters. Whitespace is trimmed and
 * collapsed, control characters are rejected, empty entries are dropped, and
 * duplicates (ignoring case) keep their first spelling. `undefined` = not supplied
 * (callers keep the stored tags); `null` or [] clears them.
 */
export function parseTags(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  if (!Array.isArray(raw)) throw badRequest('Tags must be a list of text values');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') throw badRequest('Tags must be a list of text values');
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(entry)) throw badRequest('Tags cannot contain control characters');
    const tag = entry.trim().replace(/\s+/g, ' ');
    if (tag === '') continue;
    if (tag.length > MAX_TAG_LENGTH) throw badRequest(`A tag must be ${MAX_TAG_LENGTH} characters or fewer`);
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  if (out.length > MAX_TAGS) throw badRequest(`Use at most ${MAX_TAGS} tags`);
  return out;
}
