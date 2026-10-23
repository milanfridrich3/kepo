import type { Currency, ItemStatus, Location } from '../types';
import { getLanguage, t } from '../i18n';
import { formatDate, formatDateTime, formatMoney, dateOnly } from './intl';

// Everything below that produces text reads the language currently selected
// (see i18n/index.ts). Components that call these helpers must also call
// useI18n() so they re-render when the language changes.

/**
 * Calendar-day arithmetic anchored to UTC, matching
 * server/src/utils/dates.ts exactly (same formula, same UTC anchor), so
 * the Dashboard's server-computed "days remaining" and this client's
 * independently-computed warranty display can never disagree for the
 * same warranty_expiration value.
 */
function utcDayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const now = new Date();
  const todayNum = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  return utcDayNumber(dateStr) - todayNum;
}

export type WarrantyTone = 'emerald' | 'amber' | 'rose';
export function warrantyState(dateStr: string | null): { label: string; tone: WarrantyTone; days: number } | null {
  if (!dateStr) return null;
  const days = daysUntil(dateStr)!;
  if (days < 0) return { label: t('format.warranty.expired'), tone: 'rose', days };
  if (days <= 30) return { label: t('format.warranty.expiringSoon'), tone: 'amber', days };
  return { label: t('format.warranty.active'), tone: 'emerald', days };
}

/**
 * Formats a plain "YYYY-MM-DD" calendar date in the interface language. The day
 * is built from its components (never `new Date("YYYY-MM-DD")`, which is UTC
 * midnight), so it cannot shift with the viewer's timezone.
 */
export function fmtDate(s: string | null): string {
  return formatDate(s, getLanguage());
}

/**
 * An amount in ITS OWN currency. Pass the currency stored with the amount
 * (`item.currency`), never the account's current default: changing the
 * default must not change how an existing amount is shown or what it means.
 */
export function fmtMoney(v: number | null, currency: Currency): string {
  return formatMoney(v, currency, getLanguage());
}

export function pathFor(locationId: number | null, locations: Location[]): Location[] {
  if (locationId === null) return [];
  const byId = new Map(locations.map(l => [l.id, l]));
  const chain: Location[] = [];
  const seen = new Set<number>(); // cycle guard: bad data must never hang the page
  let cur = byId.get(locationId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

export function pathStr(locationId: number | null, locations: Location[]): string {
  const chain = pathFor(locationId, locations);
  return chain.length ? chain.map(l => l.name).join(' → ') : t('common.unassigned');
}

/** "12 Oct" (adds the year when it isn't the current one). Same calendar-safe parsing as fmtDate. */
export function fmtShort(s: string | null): string {
  if (!s) return '—';
  const date = dateOnly(s);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return formatDateTime(date, getLanguage(), sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Relative day for a full timestamp: "Today", "Yesterday", "3 days ago", else a short date. */
export function relativeDay(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
  if (diff <= 0) return t('format.today');
  if (diff === 1) return t('format.yesterday');
  if (diff < 7) return t('format.daysAgo', { count: diff });
  return formatDateTime(then, getLanguage(), { day: 'numeric', month: 'short' });
}

/** Time-of-day greeting. (The original "before 5 am is evening" rule is kept as is.) */
export function greeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return t('format.greeting.evening');
  if (hour < 12) return t('format.greeting.morning');
  if (hour < 18) return t('format.greeting.afternoon');
  return t('format.greeting.evening');
}

export function firstName(fullName: string | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Last two segments of a location path: "Bedroom → Desk". Full path stays on the item detail page. */
export function shortPath(locationId: number | null, locations: Location[]): string {
  const chain = pathFor(locationId, locations);
  if (chain.length === 0) return t('common.noLocation');
  return chain.slice(-2).map(l => l.name).join(' → ');
}

/** Locations ordered so children follow their parents (sorted by full path). */
export function sortedByPath(locations: Location[]): Location[] {
  const collator = new Intl.Collator(getLanguage() === 'cs' ? 'cs-CZ' : 'en-GB');
  return [...locations].sort((a, b) => collator.compare(pathStr(a.id, locations), pathStr(b.id, locations)));
}

/** "142 days remaining" / "Expires today" / "Expired 3 days ago" */
export function warrantyDaysLabel(days: number): string {
  if (days < 0) return t('format.expiredAgo', { count: Math.abs(days) });
  if (days === 0) return t('format.expiresToday');
  return t('format.daysRemaining', { count: days });
}

/** "Due in 3 days" / "Due today" / "5 days overdue" */
export function dueLabel(dateStr: string): string {
  const days = daysUntil(dateStr);
  if (days === null) return '';
  if (days < 0) return t('format.daysOverdue', { count: Math.abs(days) });
  if (days === 0) return t('format.dueToday');
  if (days === 1) return t('format.dueTomorrow');
  return t('format.dueIn', { count: days });
}

/** Localized label of an item status. */
export function statusLabel(status: ItemStatus): string {
  return t(`status.${status}` as const);
}

const SEEDED_CATEGORIES = new Set(['Electronics', 'Tools', 'Clothing', 'Sports', 'Books', 'Accessories', 'Household', 'Collectibles', 'Other']);

/**
 * Display name of a category. The categories are a fixed list seeded in the
 * database in English; the stored name stays the identifier and only its
 * display is translated. Unknown names are shown as they are.
 */
export function categoryLabel(name: string | null): string {
  if (!name) return t('category.none');
  return SEEDED_CATEGORIES.has(name) ? t(`category.${name}` as 'category.Other') : name;
}
