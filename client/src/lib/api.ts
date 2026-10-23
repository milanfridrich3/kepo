import type {
  User, Item, ItemInput, Location, Category, Borrowing, DashboardData, WarrantyBuckets, Language, Currency, VerificationInfo,
  InsightsData, ReminderEntry, HouseholdData, SharedItem, ItemDocument, ItemPhoto, DocumentKind, SavedSearch, ItemFilterQuery,
} from '../types';
import { getLanguage, t } from '../i18n';

// Local dev falls back to the API on :4000; a production build must get VITE_API_URL
// (client/.env.production, see client/.env.example) and otherwise calls the same origin under /api.
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api');

export class ApiError extends Error {
  status: number;
  /** Machine-readable reason from the server, e.g. 'session_expired'. */
  code?: string;
  /** Seconds to wait before retrying (resend cooldown), when the server says so. */
  retryAfterSeconds?: number;
  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Called once whenever the server says the session is no longer valid
 * (expired, revoked by a password change, or the account is gone). The auth
 * context registers it so every screen reacts the same way: signed out and
 * sent to the sign-in page, instead of each page showing its own error.
 */
let onSessionInvalid: (() => void) | null = null;
export function setSessionInvalidHandler(handler: (() => void) | null) {
  onSessionInvalid = handler;
}

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 90_000;

/** Plain-language message for when the server sent no usable one (HTML error page, empty body…). */
function fallbackMessage(status: number): string {
  if (status === 404) return t('error.notFound');
  if (status === 413) return t('error.tooLarge');
  if (status === 429) return t('error.tooMany');
  if (status >= 500) return t('error.server');
  return t('error.generic');
}

async function send<T>(path: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    // The interface language rides along on every request so the server answers in it (error messages).
    const headers = { ...(init.headers || {}), 'Accept-Language': getLanguage() };
    res = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include', signal: controller.signal });
  } catch (err) {
    // fetch only rejects for network-level failures and aborts, never for HTTP errors.
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    throw new ApiError(
      0,
      timedOut ? t('error.timeout') : t('error.network')
    );
  } finally {
    window.clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;

  let body: unknown = null;
  try { body = await res.json(); } catch { /* empty or non-JSON body */ }

  if (!res.ok) {
    const parsed = body as { error?: unknown; code?: unknown; retryAfterSeconds?: unknown } | null;
    const message = typeof parsed?.error === 'string' && parsed.error ? parsed.error : fallbackMessage(res.status);
    const code = typeof parsed?.code === 'string' ? parsed.code : undefined;
    if (res.status === 401 && code === 'session_expired') onSessionInvalid?.();
    const retry = typeof parsed?.retryAfterSeconds === 'number' ? parsed.retryAfterSeconds : undefined;
    throw new ApiError(res.status, message, code, retry);
  }
  if (body === null || typeof body !== 'object') {
    throw new ApiError(res.status, t('error.unreadable'));
  }
  return body as T;
}

function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  return send<T>(
    path,
    { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } },
    REQUEST_TIMEOUT_MS
  );
}

/**
 * Like `request`, but for a multipart/form-data body (file upload). The
 * browser sets the Content-Type header itself, including the multipart
 * boundary — setting it manually would omit the boundary and break the
 * upload — so this intentionally does not send JSON headers.
 */
function requestForm<T>(path: string, formData: FormData, method = 'POST'): Promise<T> {
  return send<T>(path, { method, body: formData }, UPLOAD_TIMEOUT_MS);
}

/** What the server reports for an item import (and for its dry-run preview). */
export interface ImportReport {
  dryRun: boolean;
  format: 'csv' | 'json';
  rowsInFile: number;
  imported: number;
  skippedDuplicates: number;
  skippedArchived: number;
  rejected: number;
  locationsCreated: number;
  problems: { row: number; level: 'error' | 'warning'; message: string }[];
}

/** GET that returns the body as text (CSV). Errors come back as the usual JSON `{ error }`. */
async function requestText(path: string): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { credentials: 'include', headers: { 'Accept-Language': getLanguage() }, signal: controller.signal });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    throw new ApiError(0, timedOut ? t('error.timeout') : t('error.network'));
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    let message = fallbackMessage(res.status);
    let code: string | undefined;
    try {
      const body = (await res.json()) as { error?: unknown; code?: unknown };
      if (typeof body.error === 'string' && body.error) message = body.error;
      if (typeof body.code === 'string') code = body.code;
    } catch { /* not JSON */ }
    if (res.status === 401 && code === 'session_expired') onSessionInvalid?.();
    throw new ApiError(res.status, message, code);
  }
  return res.text();
}

export type FeedbackCategory = 'bug' | 'idea' | 'privacy' | 'other';

export const api = {
  // --- auth ---
  register: (data: { email: string; password: string; name: string; language: Language; currency?: Currency }) =>
    request<{ user: User; verification: VerificationInfo }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me'),
  verifyEmail: (code: string) =>
    request<{ user: User }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ code }) }),
  resendVerification: () => request<{ retryAfterSeconds: number }>('/auth/resend-verification', { method: 'POST' }),
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token: string, newPassword: string) =>
    request<void>('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),

  // --- account ---
  updateProfile: (data: { name: string }) =>
    request<{ user: User }>('/account/profile', { method: 'PUT', body: JSON.stringify(data) }),
  updatePreferences: (data: { language?: Language; currency?: Currency; reminderEmails?: boolean }) =>
    request<{ user: User }>('/account/preferences', { method: 'PUT', body: JSON.stringify(data) }),
  updateEmail: (data: { email: string; currentPassword: string }) =>
    request<{ user: User; verification: VerificationInfo }>('/account/email', { method: 'PUT', body: JSON.stringify(data) }),
  updatePassword: (data: { currentPassword: string; newPassword: string }) =>
    request<void>('/account/password', { method: 'PUT', body: JSON.stringify(data) }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return requestForm<{ user: User }>('/account/avatar', form, 'POST');
  },
  removeAvatar: () => request<{ user: User }>('/account/avatar', { method: 'DELETE' }),
  deleteAccount: (password: string) =>
    request<void>('/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
  /** Everything the account owns as one JSON document (see server/src/account/export.ts). Shape is documented there, not typed here. */
  exportData: () => request<Record<string, unknown>>('/account/export'),
  /** The items as a CSV file's text (spreadsheets). */
  exportItemsCsv: () => requestText('/account/export.csv'),
  /** Imports items from a CSV/JSON file's text; with `dryRun` nothing is saved and the report says what would happen. */
  importItems: (content: string, dryRun: boolean) =>
    request<ImportReport>('/items/import', { method: 'POST', body: JSON.stringify({ content, dryRun }) }),

  // --- categories ---
  categories: () => request<{ categories: Category[] }>('/categories'),

  // --- locations ---
  locations: () => request<{ locations: Location[] }>('/locations'),
  createLocation: (data: { name: string; parentId: number | null }) =>
    request<{ location: Location }>('/locations', { method: 'POST', body: JSON.stringify(data) }),
  updateLocation: (id: number, data: { name: string; parentId: number | null }) =>
    request<{ location: Location }>(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** `moveItemsTo`: where the place's items go ('none' = no location); required by the server when it still holds items. */
  deleteLocation: (id: number, moveItemsTo?: number | 'none') =>
    request<void>(`/locations/${id}${moveItemsTo === undefined ? '' : `?moveItemsTo=${moveItemsTo}`}`, { method: 'DELETE' }),

  // --- items ---
  items: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
    ).toString();
    return request<{ items: Item[] }>(`/items${qs ? `?${qs}` : ''}`);
  },
  item: (id: number) => request<{ item: Item }>(`/items/${id}`),
  createItem: (data: ItemInput) => request<{ item: Item }>('/items', { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (id: number, data: ItemInput) =>
    request<{ item: Item }>(`/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archiveItem: (id: number) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  uploadItemImage: (id: number, file: File) => {
    const form = new FormData();
    form.append('image', file);
    return requestForm<{ item: Item }>(`/items/${id}/image`, form, 'POST');
  },
  removeItemImage: (id: number) => request<{ item: Item }>(`/items/${id}/image`, { method: 'DELETE' }),
  moveItem: (id: number, locationId: number | null) =>
    request<{ item: Item }>(`/items/${id}/move`, { method: 'POST', body: JSON.stringify({ locationId }) }),
  lendItem: (id: number, borrowerName: string, expectedReturnDate: string | null) =>
    request<{ item: Item }>(`/items/${id}/lend`, { method: 'POST', body: JSON.stringify({ borrowerName, expectedReturnDate }) }),
  updateLoan: (id: number, borrowerName: string, expectedReturnDate: string | null) =>
    request<{ item: Item }>(`/items/${id}/loan`, { method: 'PUT', body: JSON.stringify({ borrowerName, expectedReturnDate }) }),
  returnItem: (id: number) => request<{ item: Item }>(`/items/${id}/return`, { method: 'POST' }),

  // --- borrowing / warranties / dashboard / search ---
  borrowings: () => request<{ borrowings: Borrowing[] }>('/borrowing'),
  warranties: () => request<WarrantyBuckets>('/warranties'),
  dashboard: () => request<DashboardData>('/dashboard'),
  search: (q: string) => request<{ items: Item[] }>(`/search?q=${encodeURIComponent(q)}`),

  // --- insights / reminders ---
  insights: () => request<InsightsData>('/insights'),
  reminders: () => request<{ reminders: ReminderEntry[] }>('/reminders'),

  // --- advanced item management ---
  tags: () => request<{ tags: { tag: string; count: number }[] }>('/items/tags'),
  bulkArchive: (ids: number[]) => request<{ archived: number }>('/items/bulk/archive', { method: 'POST', body: JSON.stringify({ ids }) }),
  bulkMove: (ids: number[], locationId: number | null) =>
    request<{ moved: number }>('/items/bulk/move', { method: 'POST', body: JSON.stringify({ ids, locationId }) }),
  bulkTags: (ids: number[], add: string[], remove: string[]) =>
    request<{ updated: number; skipped: number }>('/items/bulk/tags', { method: 'POST', body: JSON.stringify({ ids, add, remove }) }),
  sendFeedback: (category: FeedbackCategory, message: string) => request<{ id: number; notified: boolean }>('/feedback', { method: 'POST', body: JSON.stringify({ category, message }) }),
  purgeItems: (ids: number[]) => request<{ deleted: number }>('/items/bulk/purge', { method: 'POST', body: JSON.stringify({ ids }) }),
  restoreItem: (id: number) => request<{ item: Item }>(`/items/${id}/restore`, { method: 'POST' }),
  savedSearches: () => request<{ savedSearches: SavedSearch[] }>('/saved-searches'),
  createSavedSearch: (name: string, query: ItemFilterQuery) =>
    request<{ savedSearch: SavedSearch }>('/saved-searches', { method: 'POST', body: JSON.stringify({ name, query }) }),
  deleteSavedSearch: (id: number) => request<void>(`/saved-searches/${id}`, { method: 'DELETE' }),
  suggestCategory: (name: string, brand?: string, model?: string) => {
    const qs = new URLSearchParams({ name, ...(brand ? { brand } : {}), ...(model ? { model } : {}) });
    return request<{ suggestion: { categoryId: number; name: string; matched: string } | null }>(`/suggest/category?${qs}`);
  },

  // --- extra photos and documents ---
  itemPhotos: (id: number) => request<{ photos: ItemPhoto[] }>(`/items/${id}/photos`),
  addItemPhoto: (id: number, file: File) => {
    const form = new FormData();
    form.append('image', file);
    return requestForm<{ photo: { id: number } }>(`/items/${id}/photos`, form, 'POST');
  },
  deleteItemPhoto: (id: number, photoId: number) => request<void>(`/items/${id}/photos/${photoId}`, { method: 'DELETE' }),
  itemDocuments: (id: number) => request<{ documents: ItemDocument[] }>(`/items/${id}/documents`),
  addItemDocument: (id: number, file: File, kind: DocumentKind) => {
    const form = new FormData();
    form.append('kind', kind); // before the file, so the server sees the field first
    form.append('file', file);
    return requestForm<{ document: ItemDocument }>(`/items/${id}/documents`, form, 'POST');
  },
  deleteItemDocument: (id: number, docId: number) => request<void>(`/items/${id}/documents/${docId}`, { method: 'DELETE' }),

  // --- household ---
  household: () => request<{ household: HouseholdData | null }>('/household'),
  createHousehold: (name: string) => request<{ household: HouseholdData }>('/household', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteHousehold: () => request<void>('/household', { method: 'DELETE' }),
  createInvite: () => request<{ code: string; expiresAt: string }>('/household/invites', { method: 'POST' }),
  revokeInvite: (id: number) => request<void>(`/household/invites/${id}`, { method: 'DELETE' }),
  joinHousehold: (code: string) => request<{ household: HouseholdData }>('/household/join', { method: 'POST', body: JSON.stringify({ code }) }),
  leaveHousehold: () => request<void>('/household/leave', { method: 'POST' }),
  removeHouseholdMember: (userId: number) => request<void>(`/household/members/${userId}`, { method: 'DELETE' }),
  setHouseholdSharing: (shareItems: boolean) =>
    request<{ household: HouseholdData }>('/household/sharing', { method: 'PUT', body: JSON.stringify({ shareItems }) }),
  householdItems: (q?: string) => request<{ items: SharedItem[] }>(`/household/items${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  // --- calendar feed ---
  calendarFeed: () => request<{ enabled: boolean }>('/calendar-feed'),
  enableCalendarFeed: () => request<{ enabled: true; token: string }>('/calendar-feed', { method: 'POST' }),
  disableCalendarFeed: () => request<void>('/calendar-feed', { method: 'DELETE' }),
};

/** Where a file is downloaded from (same-origin credentials ride along with the link). */
export const itemPhotoUrl = (itemId: number, photoId: number) => `${API_URL}/items/${itemId}/photos/${photoId}`;
export const itemDocumentUrl = (itemId: number, docId: number) => `${API_URL}/items/${itemId}/documents/${docId}/file`;
