import { conflict, notFound } from '../utils/errors';
import type { Db } from './service';

/**
 * Extra photos and documents attached to an item. Pure helpers (file type check, names)
 * plus the database functions; the routes handle the upload itself.
 */

export const MAX_EXTRA_PHOTOS = 5;
export const MAX_DOCUMENTS_PER_ITEM = 20;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const DOCUMENT_KINDS = ['receipt', 'warranty', 'manual', 'other'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v);
}

/**
 * Decides the real type of an uploaded document from its first bytes, never from the
 * name or the client's Content-Type. Only PDF and the common image formats are accepted.
 * Returns null for anything else (office files, HTML, SVG, scripts, archives…).
 */
export function sniffDocumentType(buf: Buffer): { mime: string; isImage: boolean } | null {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', isImage: false };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', isImage: true };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', isImage: true };
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', isImage: true };
  return null;
}

const EXTENSION: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** A display name that is safe to store and to put in a header: no path, no control characters, at most 120 characters, extension matching the real type. */
export function safeDocumentName(raw: string | undefined, mime: string): string {
  // eslint-disable-next-line no-control-regex
  let base = (raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/^.*[\\/]/, '').replace(/["<>:|?*]/g, '_').trim();
  base = base.replace(/\.[^.]*$/, '').trim().replace(/^\.+/, '');
  if (base === '') base = 'document';
  const ext = EXTENSION[mime] ?? 'bin';
  return `${[...base].slice(0, 110).join('')}.${ext}`;
}

/** Content-Disposition for a download: ASCII fallback plus the UTF-8 name (RFC 6266 / 5987). */
export function attachmentHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** The item must be the user's and not removed; locks it so concurrent uploads cannot both pass the limit. */
async function lockItem(db: Db, userId: number, itemId: number): Promise<void> {
  const { rows } = await db.query('SELECT id FROM items WHERE id = $1 AND user_id = $2 AND archived = false FOR UPDATE', [itemId, userId]);
  if (rows.length === 0) throw notFound('Item not found');
}

async function ownedItem(db: Db, userId: number, itemId: number): Promise<void> {
  const { rows } = await db.query('SELECT 1 FROM items WHERE id = $1 AND user_id = $2 AND archived = false', [itemId, userId]);
  if (rows.length === 0) throw notFound('Item not found');
}

// ---- extra photos ----

export async function listPhotos(db: Db, userId: number, itemId: number): Promise<{ id: number; createdAt: string }[]> {
  await ownedItem(db, userId, itemId);
  const { rows } = await db.query('SELECT id, created_at FROM item_photos WHERE item_id = $1 AND user_id = $2 ORDER BY id', [itemId, userId]);
  return rows.map(r => ({ id: r.id, createdAt: (r.created_at as Date).toISOString() }));
}

export async function addPhoto(db: Db, userId: number, itemId: number, data: Buffer, mime: string): Promise<{ id: number }> {
  await lockItem(db, userId, itemId);
  const n = (await db.query('SELECT count(*)::int AS n FROM item_photos WHERE item_id = $1', [itemId])).rows[0].n as number;
  if (n >= MAX_EXTRA_PHOTOS) throw conflict(`An item can have up to ${MAX_EXTRA_PHOTOS} extra photos`);
  const { rows } = await db.query(
    'INSERT INTO item_photos (item_id, user_id, image_data, image_mime) VALUES ($1,$2,$3,$4) RETURNING id',
    [itemId, userId, data, mime]
  );
  return { id: rows[0].id };
}

export async function getPhoto(db: Db, userId: number, itemId: number, photoId: number): Promise<{ data: Buffer; mime: string }> {
  const { rows } = await db.query(
    `SELECT p.image_data, p.image_mime FROM item_photos p JOIN items i ON i.id = p.item_id
      WHERE p.id = $1 AND p.item_id = $2 AND i.user_id = $3 AND i.archived = false`,
    [photoId, itemId, userId]
  );
  if (rows.length === 0) throw notFound('Photo not found');
  return { data: rows[0].image_data, mime: rows[0].image_mime };
}

export async function deletePhoto(db: Db, userId: number, itemId: number, photoId: number): Promise<void> {
  const { rowCount } = await db.query(
    `DELETE FROM item_photos p USING items i
      WHERE p.id = $1 AND p.item_id = $2 AND i.id = p.item_id AND i.user_id = $3 AND i.archived = false`,
    [photoId, itemId, userId]
  );
  if (!rowCount) throw notFound('Photo not found');
}

// ---- documents ----

export interface DocumentInfo { id: number; kind: DocumentKind; filename: string; mime: string; sizeBytes: number; createdAt: string }

export async function listDocuments(db: Db, userId: number, itemId: number): Promise<DocumentInfo[]> {
  await ownedItem(db, userId, itemId);
  const { rows } = await db.query(
    'SELECT id, kind, filename, mime, size_bytes, created_at FROM item_documents WHERE item_id = $1 AND user_id = $2 ORDER BY id',
    [itemId, userId]
  );
  return rows.map(r => ({ id: r.id, kind: r.kind, filename: r.filename, mime: r.mime, sizeBytes: r.size_bytes, createdAt: (r.created_at as Date).toISOString() }));
}

export async function addDocument(
  db: Db, userId: number, itemId: number, doc: { kind: DocumentKind; filename: string; mime: string; data: Buffer }
): Promise<{ id: number }> {
  await lockItem(db, userId, itemId);
  const n = (await db.query('SELECT count(*)::int AS n FROM item_documents WHERE item_id = $1', [itemId])).rows[0].n as number;
  if (n >= MAX_DOCUMENTS_PER_ITEM) throw conflict(`An item can have up to ${MAX_DOCUMENTS_PER_ITEM} documents`);
  const { rows } = await db.query(
    'INSERT INTO item_documents (item_id, user_id, kind, filename, mime, size_bytes, data) VALUES ($1,$2,$3::document_kind,$4,$5,$6,$7) RETURNING id',
    [itemId, userId, doc.kind, doc.filename, doc.mime, doc.data.length, doc.data]
  );
  return { id: rows[0].id };
}

export async function getDocument(db: Db, userId: number, itemId: number, docId: number): Promise<{ data: Buffer; mime: string; filename: string }> {
  const { rows } = await db.query(
    `SELECT d.data, d.mime, d.filename FROM item_documents d JOIN items i ON i.id = d.item_id
      WHERE d.id = $1 AND d.item_id = $2 AND i.user_id = $3 AND i.archived = false`,
    [docId, itemId, userId]
  );
  if (rows.length === 0) throw notFound('Document not found');
  return { data: rows[0].data, mime: rows[0].mime, filename: rows[0].filename };
}

export async function deleteDocument(db: Db, userId: number, itemId: number, docId: number): Promise<void> {
  const { rowCount } = await db.query(
    `DELETE FROM item_documents d USING items i
      WHERE d.id = $1 AND d.item_id = $2 AND i.id = d.item_id AND i.user_id = $3 AND i.archived = false`,
    [docId, itemId, userId]
  );
  if (!rowCount) throw notFound('Document not found');
}
