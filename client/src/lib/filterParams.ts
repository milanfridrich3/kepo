import type { ItemFilterQuery } from '../types';
import { CURRENCIES } from '../types';
import type { Currency } from '../types';

/**
 * The item list's filters live in the address (?status=stored&tags=garage…), so a filtered
 * view can be bookmarked, shared with yourself, and saved. These pure functions convert between
 * the address, the filter object (also what a saved filter stores) and the API query.
 * The server validates everything again; this only keeps the UI's state tidy.
 */

const WARRANTY = ['expired', 'expiring30', 'expiring90', 'active', 'none'] as const;
const SORTS = ['name', 'recent', 'updated', 'purchaseDate', 'value', 'warranty'] as const;

const posInt = (v: string | null) => (v && /^[1-9]\d{0,9}$/.test(v) ? Number(v) : undefined);
const amount = (v: string | null) => (v && /^\d+([.,]\d{1,2})?$/.test(v.trim()) ? Number(v.trim().replace(',', '.')) : undefined);
const date = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const list = (v: string | null) => (v ? v.split(',').map(x => x.trim()).filter(Boolean) : []);

export function paramsToFilter(p: URLSearchParams): ItemFilterQuery {
  const f: ItemFilterQuery = {};
  const status = list(p.get('status')); if (status.length) f.status = status;
  const categoryId = posInt(p.get('categoryId')); if (categoryId) f.categoryId = categoryId;
  const locationId = posInt(p.get('locationId')); if (locationId) { f.locationId = locationId; f.sub = true; }
  const archived = p.get('archived'); if (archived === 'only' || archived === 'include') f.archived = archived;
  const search = p.get('search')?.trim(); if (search) f.search = search.slice(0, 100);
  const tags = list(p.get('tags')); if (tags.length) f.tags = tags;
  const currency = p.get('currency'); if (currency && (CURRENCIES as readonly string[]).includes(currency)) f.currency = currency as Currency;
  const valueMin = amount(p.get('valueMin')); if (valueMin !== undefined) f.valueMin = valueMin;
  const valueMax = amount(p.get('valueMax')); if (valueMax !== undefined) f.valueMax = valueMax;
  const warranty = p.get('warranty'); if (warranty && (WARRANTY as readonly string[]).includes(warranty)) f.warranty = warranty as ItemFilterQuery['warranty'];
  const from = date(p.get('purchasedFrom')); if (from) f.purchasedFrom = from;
  const to = date(p.get('purchasedTo')); if (to) f.purchasedTo = to;
  if (p.get('hasPhoto') === 'true') f.hasPhoto = true;
  if (p.get('hasDocuments') === 'true') f.hasDocuments = true;
  const sort = p.get('sort'); if (sort && (SORTS as readonly string[]).includes(sort)) f.sort = sort;
  return f;
}

export function filterToParams(f: ItemFilterQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (f.status?.length) p.set('status', f.status.join(','));
  if (f.categoryId) p.set('categoryId', String(f.categoryId));
  if (f.locationId) p.set('locationId', String(f.locationId));
  if (f.archived) p.set('archived', f.archived);
  if (f.search) p.set('search', f.search);
  if (f.tags?.length) p.set('tags', f.tags.join(','));
  if (f.currency) p.set('currency', f.currency);
  if (f.valueMin !== undefined) p.set('valueMin', String(f.valueMin));
  if (f.valueMax !== undefined) p.set('valueMax', String(f.valueMax));
  if (f.warranty) p.set('warranty', f.warranty);
  if (f.purchasedFrom) p.set('purchasedFrom', f.purchasedFrom);
  if (f.purchasedTo) p.set('purchasedTo', f.purchasedTo);
  if (f.hasPhoto) p.set('hasPhoto', 'true');
  if (f.hasDocuments) p.set('hasDocuments', 'true');
  if (f.sort) p.set('sort', f.sort);
  return p;
}

/** Query-string values for GET /api/items. */
export function filterToApiParams(f: ItemFilterQuery): Record<string, string> {
  const out: Record<string, string> = {};
  filterToParams(f).forEach((v, k) => { out[k] = v; });
  if (f.locationId) out.sub = 'true';
  return out;
}

/** Number of "extra" filters in use (not counting the quick ones always visible), for the badge on the filter button. */
export function advancedFilterCount(f: ItemFilterQuery): number {
  return [f.tags?.length, f.currency, f.valueMin !== undefined, f.valueMax !== undefined, f.warranty, f.purchasedFrom, f.purchasedTo, f.hasPhoto, f.hasDocuments, f.archived]
    .filter(Boolean).length;
}

export const isFilterEmpty = (f: ItemFilterQuery) => filterToParams(f).toString() === '';
