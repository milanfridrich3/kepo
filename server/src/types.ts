/**
 * Server-side domain types.
 *
 * `client/src/types.ts` is a deliberate hand-kept counterpart (the two packages
 * do not import each other; a cross-package import would put files outside
 * each project's `rootDir`). Change a type here and in that file together.
 */

export type ItemStatus =
  | 'with_me'
  | 'stored'
  | 'borrowed'
  | 'lost'
  | 'sold'
  | 'disposed';

export const STATUSES: ItemStatus[] = [
  'with_me',
  'stored',
  'borrowed',
  'lost',
  'sold',
  'disposed',
];

export const STATUS_LABELS: Record<ItemStatus, string> = {
  with_me: 'With me',
  stored: 'Stored',
  borrowed: 'Borrowed',
  lost: 'Lost',
  sold: 'Sold',
  disposed: 'Disposed',
};

/** Interface languages the product supports (web today, Android later). English is the default. */
export type Language = 'en' | 'cs';
export const LANGUAGES: Language[] = ['en', 'cs'];
export const DEFAULT_LANGUAGE: Language = 'en';

/** ISO 4217 codes of the supported currencies (CZK Kč, EUR €, USD $, GBP £). */
export type Currency = 'CZK' | 'EUR' | 'USD' | 'GBP';
export const CURRENCIES: Currency[] = ['CZK', 'EUR', 'USD', 'GBP'];

/** Initial currency for a new account, from its initial language. Only a default — the user can change it independently. */
export function defaultCurrencyForLanguage(language: Language): Currency {
  return language === 'cs' ? 'CZK' : 'EUR';
}

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as string[]).includes(value);
}

export function isCurrency(value: unknown): value is Currency {
  return typeof value === 'string' && (CURRENCIES as string[]).includes(value);
}

export interface User {
  id: number;
  email: string;
  name: string;
  createdAt: string;
  /** Saved interface language; the same preference is used by every client. */
  language: Language;
  /** Default currency for new item values. Never converts existing amounts. */
  currency: Currency;
  /** False until the address has been confirmed with an emailed code (or password-reset link). */
  emailVerified: boolean;
  /** Opt-in daily email about warranties ending and loans due. Off by default. */
  reminderEmails: boolean;
  /** ISO timestamp of the last avatar upload, or null with no avatar set. Used only to cache-bust the avatar URL — never a direct file path. */
  avatarUpdatedAt: string | null;
}

export interface Category {
  id: number;
  name: string;
}

export interface Location {
  id: number;
  userId: number;
  name: string;
  parentId: number | null;
}

export interface BorrowerInfo {
  borrowingId: number;
  borrowerName: string;
  lentDate: string;
  expectedReturnDate: string | null;
}

export interface Item {
  id: number;
  userId: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Legacy external link, kept only as a fallback when no real image has been uploaded. New items should use imageUpdatedAt instead. */
  photoUrl: string | null;
  /** ISO timestamp of the last image upload, or null with no uploaded image. Used only to cache-bust GET /api/items/:id/image. */
  imageUpdatedAt: string | null;
  locationId: number | null;
  status: ItemStatus;
  purchaseDate: string | null;
  value: number | null;
  /** Currency `value` is expressed in. Fixed per item; changing the account currency never converts it. */
  currency: Currency;
  warrantyExpiration: string | null;
  serialNumber: string | null;
  notes: string | null;
  /** How many pieces this entry stands for (>= 1). `value` is for the whole entry, not per piece. */
  quantity: number;
  brand: string | null;
  model: string | null;
  /** Short labels chosen by the person, normalised by the API (see utils/validation.ts parseTags). */
  tags: string[];
  /** Extra photos beyond the primary one (the primary is described by imageUpdatedAt). */
  extraPhotoCount: number;
  /** Receipts, warranty cards and manuals attached to the item. */
  documentCount: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  borrower: BorrowerInfo | null;
}

export interface ItemInput {
  name: string;
  categoryId: number | null;
  photoUrl?: string | null;
  locationId: number | null;
  status: ItemStatus;
  purchaseDate?: string | null;
  value?: number | null;
  /** Omit on create to use the account currency; omit on update to keep the item's current one. */
  currency?: Currency;
  warrantyExpiration?: string | null;
  serialNumber?: string | null;
  notes?: string | null;
  /** Omit to keep the current value (update) or use 1 (create). */
  quantity?: number;
  brand?: string | null;
  model?: string | null;
  tags?: string[];
}

export interface Borrowing {
  id: number;
  itemId: number;
  itemName: string;
  borrowerName: string;
  lentDate: string;
  expectedReturnDate: string | null;
  returned: boolean;
  returnedDate: string | null;
}

export interface MoveLogEntry {
  id: number;
  itemId: number;
  itemName: string;
  fromPath: string;
  toPath: string;
  /** Null means "no location" (the path strings above are English and kept for older clients). */
  fromLocationId: number | null;
  toLocationId: number | null;
  movedAt: string;
}

export interface AttentionItem {
  type: 'overdue' | 'warranty';
  /** English text kept for older clients; clients should build their own localized text from the fields below. */
  message: string;
  itemId: number;
  itemName: string;
  /** Overdue loans only. */
  borrowerName?: string;
  /** Warranties only: whole days until the warranty ends. */
  days?: number;
}

/** What the server reports about the verification email after registration. */
export interface VerificationInfo {
  required: boolean;
  emailSent: boolean;
  /** Seconds until another code can be requested. */
  retryAfterSeconds: number;
}

export interface DashboardData {
  totalItems: number;
  totalLocations: number;
  borrowedCount: number;
  warrantiesExpiringSoonCount: number;
  recentlyAdded: Item[];
  recentlyMoved: MoveLogEntry[];
  attention: AttentionItem[];
}

export interface WarrantyBuckets {
  active: Item[];
  expiringSoon: Item[];
  expired: Item[];
}
