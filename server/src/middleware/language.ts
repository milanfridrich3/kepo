import type { Request, Response, NextFunction } from 'express';
import { DEFAULT_LANGUAGE, isLanguage } from '../types';
import type { Language } from '../types';

/**
 * Picks the language for a response from the `Accept-Language` header.
 * The Kepo web app (and the future Android app) always sends the user's
 * saved language there; anything else falls back to English.
 */
export function resolveLanguage(header: string | undefined): Language {
  if (!header) return DEFAULT_LANGUAGE;
  const candidates = header
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
      const weight = q ? Number(q.slice(2)) : 1;
      return { primary: tag.trim().toLowerCase().split('-')[0], weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter(c => c.weight > 0 && isLanguage(c.primary))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return candidates.length > 0 ? (candidates[0].primary as Language) : DEFAULT_LANGUAGE;
}

export function languageMiddleware(req: Request, _res: Response, next: NextFunction) {
  req.lang = resolveLanguage(req.get('accept-language'));
  next();
}
