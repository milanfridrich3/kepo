import type { Language } from '../types';
import { DEFAULT_LANGUAGE } from '../types';
import { interpolate, lookup } from './core';
import type { Catalog, Params } from './core';
import { en } from './en';
import { cs } from './cs';

export type { Params } from './core';

export type MessageKey = keyof typeof en;
type Plain<K> = K extends `${string}_${'one' | 'few' | 'other'}` ? never : K;
type PluralBase<K> = K extends `${infer B}_other` ? B : never;
/** Everything `t()` accepts: plain keys, and the base name of a plural message (which needs `count`). */
export type TranslationKey = Plain<MessageKey> | PluralBase<MessageKey>;

export const CATALOGS: Record<Language, Catalog> = { en, cs };

let current: Language = DEFAULT_LANGUAGE;
export const getLanguage = (): Language => current;
export function setCurrentLanguage(lang: Language) {
  current = lang;
}

/** Translates `key` into `lang`; falls back to English, then to the key itself so a gap is visible but never blank. */
export function translate(lang: Language, key: TranslationKey, params?: Params): string {
  const found = lookup(CATALOGS[lang], lang, key, params) ?? lookup(CATALOGS.en, 'en', key, params);
  if (found === undefined) {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing message: ${key}`);
    return key;
  }
  return interpolate(found, lang, params);
}

/** Translation in the language currently selected. For code outside React (API client, formatters). Components should use `useI18n()` so they re-render on a language change. */
export const t = (key: TranslationKey, params?: Params): string => translate(current, key, params);
