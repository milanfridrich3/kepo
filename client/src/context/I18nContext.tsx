import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEFAULT_LANGUAGE, isLanguage } from '../types';
import type { Language } from '../types';
import { parseTags } from '../i18n/core';
import { CATALOGS, setCurrentLanguage, translate } from '../i18n';
import type { Params, TranslationKey } from '../i18n';
import { LOCALE_TAG, lookup, interpolate } from '../i18n/core';

export const LANGUAGE_STORAGE_KEY = 'kepo-lang';

/** Renders `<b>…</b>`-style markup in a message with the caller's components, for example a `b` tag rendered as a strong element. */
export type RichTags = Record<string, (text: string) => ReactNode>;

interface I18nValue {
  lang: Language;
  locale: string;
  t: (key: TranslationKey, params?: Params) => string;
  rich: (key: TranslationKey, params?: Params, tags?: RichTags) => ReactNode;
  /**
   * Switches the interface language. Remembered in this browser so the sign-in
   * and registration screens use it before anyone is signed in; for a signed-in
   * user, Settings additionally saves it to the account.
   */
  setLanguage: (lang: Language) => void;
}

const I18nContext = createContext<I18nValue | undefined>(undefined);

function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    /* storage unavailable — default language */
  }
  return DEFAULT_LANGUAGE;
}

// Set before the first render so non-React helpers and the very first paint already agree.
const initial = readStoredLanguage();
setCurrentLanguage(initial);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Language>(initial);

  // Keep the module-level language in step during render, so any descendant
  // calling the global `t` in this same render pass sees the new language.
  setCurrentLanguage(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLanguage = useCallback((next: Language) => {
    setLang(next);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: TranslationKey, params?: Params) => translate(lang, key, params);
    const rich = (key: TranslationKey, params?: Params, tags: RichTags = {}): ReactNode => {
      const raw = lookup(CATALOGS[lang], lang, key, params) ?? lookup(CATALOGS.en, 'en', key, params) ?? key;
      // Interpolate placeholders first, then split the markup so values can never inject tags.
      const parts = parseTags(raw);
      return parts.map((part, index) => {
        const text = interpolate(part.text, lang, params);
        if ('tag' in part && tags[part.tag]) return <span key={index}>{tags[part.tag](text)}</span>;
        return text;
      });
    };
    return { lang, locale: LOCALE_TAG[lang], t, rich, setLanguage };
  }, [lang, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
