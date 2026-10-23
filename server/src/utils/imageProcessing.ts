import multer from 'multer';
import sharp from 'sharp';
import { badRequest } from './errors';

// Memory storage: the file never touches disk (this service has no
// persistent disk anyway) and is decoded/re-encoded by sharp before ever
// being stored — see migration 0003's comment for the full reasoning. One
// shared instance for every image endpoint (avatar, item photo).
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 0, parts: 2 },
});

// Formats we are willing to decode. SVG is deliberately absent (it is a
// document, not a raster, and can reference external resources); anything
// else sharp could be talked into reading is refused up front.
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff']);

// A 5 MB PNG can legally describe a billion-pixel canvas; cap the decoded
// size so a decompression bomb is rejected instead of exhausting memory.
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * Decodes, validates and re-encodes an uploaded image to WebP, resized to
 * fit within `box` (preserving aspect ratio, never upscaled past the
 * original). Decoding with sharp *is* the real validation: a renamed
 * non-image file, a truncated upload, or a crafted/polyglot file all fail
 * here rather than being trusted on the client-supplied mimetype alone.
 * Re-encoding also drops EXIF/ICC metadata (including GPS), none of which is
 * needed for display.
 */
export async function processUploadedImage(
  buffer: Buffer,
  box: { width: number; height: number; fit: 'cover' | 'inside' }
): Promise<Buffer> {
  try {
    const meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
      throw new Error(`unsupported format ${meta.format}`);
    }
    return await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate() // normalize orientation using EXIF before it's stripped
      .resize(box.width, box.height, { fit: box.fit, withoutEnlargement: box.fit === 'inside' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw badRequest('That file could not be read as an image. Use a JPG, PNG, WebP or GIF.');
  }
}
