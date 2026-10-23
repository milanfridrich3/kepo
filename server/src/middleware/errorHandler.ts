import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { HttpError } from '../utils/errors';
import { translateMessage } from '../i18n/messages';

/**
 * PostgreSQL errors that mean "the client sent something the database
 * rejects", not "the server is broken". Mapped to 4xx so a bad value never
 * surfaces as an opaque 500 (route-level validation catches almost all of
 * these first; this is the backstop).
 */
function mapDatabaseError(err: unknown): HttpError | null {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
  if (typeof code !== 'string') return null;
  if (code === '23505') return new HttpError(409, 'That already exists.');
  if (code === '23503') return new HttpError(400, 'That refers to something that no longer exists.');
  if (code === '23502' || code === '23514') return new HttpError(400, 'A required value is missing or invalid.');
  if (code.startsWith('22')) return new HttpError(400, 'One of the values you entered is invalid.');
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);

  // Every message below is English in code and localized here, once, for the language the client asked for.
  const say = (message: string) => translateMessage(message, req.lang ?? 'en');

  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: say(err.message),
      ...(err.code ? { code: err.code } : {}),
      ...(err.details ?? {}),
    });
  }
  // multer reports its own limits as a MulterError rather than an HttpError.
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: say('That image is larger than 5 MB. Choose a smaller one.') });
    }
    return res.status(400).json({ error: say('The upload could not be processed. Choose a single image file.') });
  }
  // body-parser (express.json) errors carry a `type`: malformed JSON, body too large, etc.
  const bodyErr = err as { type?: string; status?: number } | null;
  if (bodyErr && typeof bodyErr.type === 'string') {
    if (bodyErr.type === 'entity.parse.failed') return res.status(400).json({ error: say('The request body is not valid JSON.') });
    if (bodyErr.type === 'entity.too.large') return res.status(413).json({ error: say('The request is too large.') });
    if (typeof bodyErr.status === 'number' && bodyErr.status >= 400 && bodyErr.status < 500) {
      return res.status(bodyErr.status).json({ error: say('The request could not be read.') });
    }
  }
  // Errors raised by Express itself for a bad request (e.g. a malformed %-escape in a
  // path parameter: URIError with status 400) are the client's mistake, not a server fault.
  const httpish = err as { status?: unknown; statusCode?: unknown } | null;
  const httpStatus = typeof httpish?.status === 'number' ? httpish.status : httpish?.statusCode;
  if (err instanceof URIError && typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    return res.status(httpStatus).json({ error: say('The request could not be read.') });
  }
  const dbErr = mapDatabaseError(err);
  if (dbErr) return res.status(dbErr.status).json({ error: say(dbErr.message) });

  console.error('Unhandled error:', err);
  // Details are only ever echoed back in explicit local development.
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({ error: isDev ? String(err) : say('Something went wrong on our side. Please try again.') });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: translateMessage('That endpoint does not exist.', req.lang ?? 'en') });
}
