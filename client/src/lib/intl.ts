import type { Currency, Language } from '../types';
import { LOCALE_TAG } from '../i18n/core';

/**
 * The single place where numbers, money and dates become text. Everything goes
 * through `Intl` with the locale of the interface language; nothing in the app
 * concatenates a currency symbol or builds a date by hand.
 *
 * Money is formatted in the currency stored with the amount (an item's own
 * currency), never the account's current default — changing the account
 * currency must not change how an existing amount reads.
 */

const moneyCache = new Map<string, Intl.NumberFormat>();

export function formatMoney(amount: number | null | undefined, currency: Currency, lang: Language): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  const value = Number(amount);
  const whole = Number.isInteger(value);
  const cacheKey = `${lang}|${currency}|${whole}`;
  let fmt = moneyCache.get(cacheKey);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE_TAG[lang], {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    });
    moneyCache.set(cacheKey, fmt);
  }
  return fmt.format(value);
}

/** The symbol or short name Intl uses for a currency in this language ("Kč", "€", "$", "£"). */
export function currencySymbol(currency: Currency, lang: Language): string {
  const part = new Intl.NumberFormat(LOCALE_TAG[lang], { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0)
    .find(p => p.type === 'currency');
  return part?.value ?? currency;
}

export function formatNumber(value: number, lang: Language): string {
  return new Intl.NumberFormat(LOCALE_TAG[lang]).format(value);
}

/** Builds a local Date from a plain "YYYY-MM-DD" so the displayed day never shifts with the viewer's timezone. */
export function dateOnly(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDate(s: string | null, lang: Language, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  if (!s) return '—';
  return new Intl.DateTimeFormat(LOCALE_TAG[lang], options).format(dateOnly(s));
}

export function formatDateTime(date: Date, lang: Language, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE_TAG[lang], options).format(date);
}
