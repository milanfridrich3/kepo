import { Router } from 'express';
import multer from 'multer';
import { pool, withTransaction } from '../db/pool';
import { asyncHandler } from '../utils/asyncHandler';
import { badRequest } from '../utils/errors';
import { parseRouteId } from '../utils/validation';
import { imageUpload, processUploadedImage } from '../utils/imageProcessing';
import {
  MAX_DOCUMENT_BYTES, isDocumentKind, sniffDocumentType, safeDocumentName, attachmentHeader,
  listPhotos, addPhoto, getPhoto, deletePhoto, listDocuments, addDocument, getDocument, deleteDocument,
} from '../items/files';

/**
 * Extra photos and documents of an item (Extensions 2 and 3). Mounted under /api/items
 * behind requireAuth + requireVerified. All database rules (ownership, limits) live in
 * items/files.ts and are tested on a real PostgreSQL; this file only handles the upload.
 */
export const itemFilesRouter = Router();

const EXTRA_PHOTO_BOX = { width: 1200, height: 1200, fit: 'inside' as const };
const DOCUMENT_IMAGE_BOX = { width: 1800, height: 1800, fit: 'inside' as const };

// One file and one text field ("kind"); the file stays in memory, capped at 5 MB.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1, fields: 1, parts: 3 },
});

// ---- extra photos ----

itemFilesRouter.get('/:id/photos', asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  res.json({ photos: await listPhotos(pool, req.user!.id, itemId) });
}));

itemFilesRouter.post('/:id/photos', imageUpload.single('image'), asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  const file = req.file;
  if (!file) throw badRequest('No image file was uploaded');
  if (!file.mimetype.startsWith('image/')) throw badRequest('File must be an image');
  const output = await processUploadedImage(file.buffer, EXTRA_PHOTO_BOX);
  const userId = req.user!.id;
  const { id } = await withTransaction(db => addPhoto(db, userId, itemId, output, 'image/webp'));
  res.status(201).json({ photo: { id } });
}));

itemFilesRouter.get('/:id/photos/:photoId', asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  const photoId = parseRouteId(req.params.photoId, 'photo id');
  const photo = await getPhoto(pool, req.user!.id, itemId, photoId);
  // A photo's content never changes under its id, so it can be cached.
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.setHeader('Content-Type', photo.mime);
  res.send(photo.data);
}));

itemFilesRouter.delete('/:id/photos/:photoId', asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  const photoId = parseRouteId(req.params.photoId, 'photo id');
  await deletePhoto(pool, req.user!.id, itemId, photoId);
  res.status(204).end();
}));

// ---- documents ----

itemFilesRouter.get('/:id/documents', asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  res.json({ documents: await listDocuments(pool, req.user!.id, itemId) });
}));

itemFilesRouter.post('/:id/documents', documentUpload.single('file'), asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  const file = req.file;
  if (!file) throw badRequest('No file was uploaded');
  const kind = req.body?.kind ?? 'other';
  if (!isDocumentKind(kind)) throw badRequest('Document type must be receipt, warranty, manual or other');

  // The real type comes from the file's own bytes; only PDF and common images pass.
  const sniffed = sniffDocumentType(file.buffer);
  if (!sniffed) throw badRequest('Only PDF files and images (JPG, PNG, WebP) can be attached');

  let data = file.buffer;
  let mime = sniffed.mime;
  if (sniffed.isImage) {
    // Same safety as every other image: decoded, EXIF/GPS stripped, re-encoded.
    data = await processUploadedImage(file.buffer, DOCUMENT_IMAGE_BOX);
    mime = 'image/webp';
  }
  const filename = safeDocumentName(file.originalname, mime);
  const userId = req.user!.id;
  const { id } = await withTransaction(db => addDocument(db, userId, itemId, { kind, filename, mime, data }));
  res.status(201).json({ document: { id, kind, filename, mime, sizeBytes: data.length } });
}));

itemFilesRouter.get('/:id/documents/:docId/file', asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  const docId = parseRouteId(req.params.docId, 'document id');
  const doc = await getDocument(pool, req.user!.id, itemId, docId);
  // Always a download (never rendered inside the app's origin); X-Content-Type-Options: nosniff is set globally.
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', attachmentHeader(doc.filename));
  res.send(doc.data);
}));

itemFilesRouter.delete('/:id/documents/:docId', asyncHandler(async (req, res) => {
  const itemId = parseRouteId(req.params.id, 'item id');
  const docId = parseRouteId(req.params.docId, 'document id');
  await deleteDocument(pool, req.user!.id, itemId, docId);
  res.status(204).end();
}));
