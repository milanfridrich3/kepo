import type { Currency, Item, ItemStatus, Language, User } from '../types';

/**
 * Account data export ("download my data").
 *
 * `buildAccountExport` is a pure function: the route loads the account's rows
 * (every query scoped to the signed-in user) and this shapes them into one
 * self-describing JSON document. Keeping it free of database and HTTP code is
 * what makes the format unit-testable.
 *
 * What is deliberately NOT in the export: the password hash, session tokens,
 * verification codes and reset tokens (credentials), internal user ids, and the
 * binary image data (profile picture and uploaded item photos). The document
 * says so itself in `notes`, so nobody mistakes it for a full backup.
 *
 * About `items.photo_url` (exported as `photoLink`): it is the *legacy external
 * link* a person once saved for an item (migration 0001; migration 0004 added
 * real uploads in separate `image_*` columns and left it untouched). It never
 * holds the address of an uploaded photo: that URL (`/api/items/:id/image?v=`)
 * is built by the client and is not stored anywhere, so no internal path can
 * come from this column. Rows saved before the API validated links may hold
 * arbitrary text, though, and a valid link may carry credentials. So the
 * export only ever carries a well-formed http(s) link, without embedded
 * username/password (`exportablePhotoLink`).
 */

export const EXPORT_FORMAT = 'kepo-export';
export const EXPORT_VERSION = 1;

export interface ExportLocationInput {
  id: number;
  name: string;
  parentId: number | null;
}

export interface ExportLoanInput {
  id: number;
  itemId: number;
  borrowerName: string;
  lentDate: string;
  expectedReturnDate: string | null;
  returned: boolean;
  returnedDate: string | null;
}

export interface ExportMoveInput {
  id: number;
  itemId: number;
  fromLocationId: number | null;
  toLocationId: number | null;
  movedAt: Date | string;
}

export interface AccountExportInput {
  user: User;
  locations: ExportLocationInput[];
  items: Item[];
  loans: ExportLoanInput[];
  moves: ExportMoveInput[];
}

export interface AccountExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  account: {
    email: string;
    name: string;
    language: Language;
    currency: Currency;
    emailVerified: boolean;
    createdAt: string | null;
    hasProfilePicture: boolean;
  };
  locations: { id: number; name: string; parentId: number | null; path: string }[];
  items: {
    id: number;
    name: string;
    category: string | null;
    status: ItemStatus;
    locationId: number | null;
    locationPath: string | null;
    purchaseDate: string | null;
    value: number | null;
    currency: Currency;
    warrantyExpiration: string | null;
    serialNumber: string | null;
    notes: string | null;
    quantity: number;
    brand: string | null;
    model: string | null;
    tags: string[];
    photoLink: string | null;
    hasUploadedPhoto: boolean;
    archived: boolean;
    createdAt: string | null;
    updatedAt: string | null;
  }[];
  loans: {
    id: number;
    itemId: number;
    itemName: string | null;
    borrowerName: string;
    lentDate: string;
    expectedReturnDate: string | null;
    returned: boolean;
    returnedDate: string | null;
  }[];
  moves: {
    id: number;
    itemId: number;
    fromLocationId: number | null;
    toLocationId: number | null;
    movedAt: string | null;
  }[];
  notes: string[];
}

const PATH_SEPARATOR = ' → ';

const MAX_LINK_LENGTH = 2048; // same limit the API applies when a link is saved

/**
 * The legacy external photo link, made safe to write into a file the person may
 * keep or share. Returns null (the link is left out) unless it is a well-formed
 * http(s) address of at most 2048 characters, which also drops anything that is
 * not a web link: relative or internal paths, `data:`/`javascript:`/`file:`
 * values and free text saved before links were validated. A link is otherwise
 * kept exactly as saved, except that an embedded `user:password@` part is
 * removed. Tokens inside the query string cannot be told apart from ordinary
 * parameters and are kept, which docs/DATA-EXPORT.md says in plain words.
 */
export function exportablePhotoLink(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (value === '' || value.length > MAX_LINK_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username === '' && url.password === '') return value;
  url.username = '';
  url.password = '';
  return url.toString();
}

/** Timestamps arrive as Date objects from the driver (and as strings in tests); the export always carries ISO text. */
function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const text = String(value);
  return text === '' ? null : text;
}

/** Full "Parent → Child" path of every location. Stops on a repeated id, so bad data can never loop forever. */
function buildPaths(locations: ExportLocationInput[]): Map<number, string> {
  const byId = new Map(locations.map(l => [l.id, l]));
  const paths = new Map<number, string>();
  for (const loc of locations) {
    const chain: string[] = [];
    const seen = new Set<number>();
    let cur: ExportLocationInput | undefined = loc;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur.name);
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
    }
    paths.set(loc.id, chain.join(PATH_SEPARATOR));
  }
  return paths;
}

export function buildAccountExport(input: AccountExportInput, now: Date = new Date()): AccountExport {
  const { user } = input;
  const paths = buildPaths(input.locations);
  const itemNames = new Map(input.items.map(i => [i.id, i.name]));

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: now.toISOString(),
    account: {
      email: user.email,
      name: user.name,
      language: user.language,
      currency: user.currency,
      emailVerified: user.emailVerified,
      createdAt: iso(user.createdAt),
      hasProfilePicture: user.avatarUpdatedAt !== null && user.avatarUpdatedAt !== undefined,
    },
    locations: input.locations.map(l => ({
      id: l.id,
      name: l.name,
      parentId: l.parentId,
      path: paths.get(l.id) ?? l.name,
    })),
    items: input.items.map(i => ({
      id: i.id,
      name: i.name,
      category: i.categoryName,
      status: i.status,
      locationId: i.locationId,
      locationPath: i.locationId === null ? null : paths.get(i.locationId) ?? null,
      purchaseDate: i.purchaseDate,
      value: i.value,
      currency: i.currency,
      warrantyExpiration: i.warrantyExpiration,
      serialNumber: i.serialNumber,
      notes: i.notes,
      quantity: i.quantity,
      brand: i.brand,
      model: i.model,
      tags: i.tags,
      photoLink: exportablePhotoLink(i.photoUrl),
      hasUploadedPhoto: i.imageUpdatedAt !== null && i.imageUpdatedAt !== undefined,
      archived: i.archived,
      createdAt: iso(i.createdAt),
      updatedAt: iso(i.updatedAt),
    })),
    loans: input.loans.map(l => ({
      id: l.id,
      itemId: l.itemId,
      itemName: itemNames.get(l.itemId) ?? null,
      borrowerName: l.borrowerName,
      lentDate: l.lentDate,
      expectedReturnDate: l.expectedReturnDate,
      returned: l.returned,
      returnedDate: l.returnedDate,
    })),
    moves: input.moves.map(m => ({
      id: m.id,
      itemId: m.itemId,
      fromLocationId: m.fromLocationId,
      toLocationId: m.toLocationId,
      movedAt: iso(m.movedAt),
    })),
    notes: [
      'Uploaded item photos, extra photos, attached documents (such as receipts and manuals) and the profile picture are not included in this file; "hasUploadedPhoto" and "hasProfilePicture" only say whether a main photo or profile picture exists.',
      'Saved filters, household sharing and membership, the calendar feed and reminder settings, and feedback messages you sent are not included.',
      'Amounts are exactly as entered, each in its own currency; nothing was converted.',
      'Removed ("archived") items are included with archived = true.',
      'Passwords, sign-in sessions and one-time codes are never exported.',
    ],
  };
}

/** `kepo-export-YYYY-MM-DD.json`, dated in UTC. Safe to put in a Content-Disposition header (ASCII only). */
export function exportFileName(now: Date = new Date()): string {
  return `kepo-export-${now.toISOString().slice(0, 10)}.json`;
}
