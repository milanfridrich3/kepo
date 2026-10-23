import type { Language } from '../types';

/**
 * Framework-free translation engine: lookup, `{placeholder}` interpolation,
 * plural forms and `<tag>…</tag>` markup. Kept free of React so every rule is
 * unit-testable (core.test.ts) and usable from non-component code.
 *
 * Messages are plain strings. A message with plural forms is stored as
 * `base_one`, `base_few`, `base_other` (Czech) or `base_one`, `base_other`
 * (English) and addressed by `base` plus a `count` parameter; the category is
 * chosen with `Intl.PluralRules`, so each language follows its own grammar.
 */

export type Catalog = Readonly<Record<string, string>>;
export type Params = Readonly<Record<string, string | number>>;

export const LOCALE_TAG: Record<Language, string> = { en: 'en-GB', cs: 'cs-CZ' };

const pluralRules: Partial<Record<Language, Intl.PluralRules>> = {};
function pluralCategory(lang: Language, count: number): Intl.LDMLPluralRule {
  const rules = (pluralRules[lang] ??= new Intl.PluralRules(LOCALE_TAG[lang]));
  return rules.select(count);
}

/** Picks the catalog entry for `key`, applying plural selection when `params.count` is given. */
export function lookup(catalog: Catalog, lang: Language, key: string, params?: Params): string | undefined {
  if (params && typeof params.count === 'number') {
    const category = pluralCategory(lang, params.count);
    return catalog[`${key}_${category}`] ?? catalog[`${key}_other`] ?? catalog[key];
  }
  return catalog[key];
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function interpolate(template: string, lang: Language, params?: Params): string {
  if (!params) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === 'number' ? new Intl.NumberFormat(LOCALE_TAG[lang]).format(value) : value;
  });
}

export type Segment = { text: string } | { tag: string; text: string };

/** Splits `Hello <b>there</b>` into text and tagged segments. Tags do not nest; unknown markup stays literal text. */
export function parseTags(template: string): Segment[] {
  const out: Segment[] = [];
  const re = /<(\w+)>([\s\S]*?)<\/\1>/g;
  let last = 0;
  for (const m of template.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: template.slice(last, at) });
    out.push({ tag: m[1], text: m[2] });
    last = at + m[0].length;
  }
  if (last < template.length) out.push({ text: template.slice(last) });
  return out;
}

/** Placeholder names a message uses (for the parity check between languages). */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map(m => m[1]))].sort();
}

export function tagsOf(template: string): string[] {
  return [...new Set(parseTags(template).flatMap(s => ('tag' in s ? [s.tag] : [])))].sort();
}

/** Plural categories each language needs for a plural message. */
export const REQUIRED_PLURALS: Record<Language, string[]> = {
  en: ['one', 'other'],
  cs: ['one', 'few', 'other'],
};
