import { HttpError } from './errors';

/**
 * Minimal in-memory sliding-window rate limiter, keyed by an arbitrary
 * string (a user id, a client IP, or a combination). Deliberately not a new
 * dependency or database table — this app runs as a single Render web
 * service instance, so a process-local counter is a real (if not
 * distributed) mitigation for the endpoints that need one (login, register,
 * and the endpoints that verify the current password).
 *
 * Known limitation (documented rather than hidden): counters reset on
 * deploy/restart and are not shared across instances. If the app ever
 * runs more than one instance, this should move to a shared store (e.g.
 * a Redis counter or a database table).
 */
const hits = new Map<string, number[]>();
const LONGEST_WINDOW_MS = 60 * 60 * 1000;

// Drop keys whose every hit is older than the longest window we use, so the
// map cannot grow without bound under a stream of distinct keys.
const pruneTimer = setInterval(() => {
  const cutoff = Date.now() - LONGEST_WINDOW_MS;
  for (const [key, times] of hits) {
    if (times.length === 0 || times[times.length - 1] < cutoff) hits.delete(key);
  }
}, 10 * 60 * 1000);
pruneTimer.unref();

export function rateLimit(key: string, max: number, windowMs: number): void {
  const now = Date.now();
  const existing = hits.get(key) ?? [];
  const recent = existing.filter(t => now - t < windowMs);
  if (recent.length >= max) {
    throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  }
  recent.push(now);
  hits.set(key, recent);
}

/** Forget a key (e.g. after a successful login) so legitimate users aren't penalised for earlier typos. */
export function rateLimitReset(key: string): void {
  hits.delete(key);
}
