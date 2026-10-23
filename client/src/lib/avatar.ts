import type { User } from '../types';
import { API_URL } from './api';

/**
 * Builds the URL for a user's avatar image, or undefined if they have none
 * set. `avatarUpdatedAt` is embedded as a cache-busting query param — any
 * new upload changes the timestamp, so the browser never shows a stale
 * cached image after a change, while the response itself is served with a
 * long-lived, immutable Cache-Control (see server/src/routes/account.routes.ts).
 */
export function avatarUrl(user: Pick<User, 'avatarUpdatedAt'> | null | undefined): string | undefined {
  if (!user?.avatarUpdatedAt) return undefined;
  return `${API_URL}/account/avatar?v=${encodeURIComponent(user.avatarUpdatedAt)}`;
}
