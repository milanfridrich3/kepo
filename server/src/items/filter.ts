import { badRequest } from '../utils/errors';
import { isItemStatus, parseOptionalDate, escapeLike, parseTags } from '../utils/validation';
import { isCurrency } from '../types';
import type { Currency } from '../types';

/**
 * Item list filters (advanced search and saved filters).
 *
 * `parseItemFilter` turns request parameters (query-string strings, or a saved
 * filter's JSON) into one canonical, validated `ItemFilter`; `buildItemQuery`
 * turns that into SQL. Only whitelisted SQL fragments written in this file are
 * ever concatenated; every user-supplied value is a bound parameter.
 */

export const ITEM_SORTS: Record<string, string> = {
  name: 'i.name ASC, i.id ASC',
  recent: 'i.created_at DESC, i.id DESC',
  updated: 'i.updated_at DESC, i.id DESC',
  purchaseDate: 'i.purchase_date DESC NULLS LAST, i.name ASC, i.id ASC',
  value: 'i.value DESC NULLS LAST, i.name ASC, i.id ASC',
  warranty: 'i.warranty_expiration ASC NULLS LAST, i.name ASC, i.id ASC',
};

export const WARRANTY_FILTERS = ['expired', 'expiring30', 'expiring90', 'active', 'none'] as const;
export type WarrantyFilter = (typeof WARRANTY_FILTERS)[number];

export interface ItemFilter {
  status?: string[];
  categoryId?: number;
  locationId?: number;
  /** With locationId: include everything in the places nested below it. */
  sub?: boolean;
  /** 'include' = active and removed items together, 'only' = removed items only. Default: active only. */
  archived?: 'include' | 'only';
  search?: string;
  tags?: string[];
  currency?: Currency;
  valueMin?: number;
  valueMax?: number;
  warranty?: WarrantyFilter;
  purchasedFrom?: string;
  purchasedTo?: string;
  hasPhoto?: boolean;
  hasDocuments?: boolean;
  sort?: string;
}

const MAX_PG_INT = 2147483647;
const KNOWN = new Set(['status', 'categoryId', 'locationId', 'sub', 'archived', 'search', 'tags', 'currency', 'valueMin', 'valueMax', 'warranty', 'purchasedFrom', 'purchasedTo', 'hasPhoto', 'hasDocuments', 'sort']);

function blank(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
}

function list(v: unknown, label: string): string[] {
  if (Array.isArray(v)) {
    if (!v.every(x => typeof x === 'string')) throw badRequest(`${label} filter is not valid`);
    return v.flatMap(x => x.split(','));
  }
  if (typeof v === 'string') return v.split(',');
  throw badRequest(`${label} filter is not valid`);
}

function posInt(v: unknown, label: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isInteger(n) || n <= 0 || n > MAX_PG_INT) throw badRequest(`Invalid ${label}`);
  return n;
}

function bool(v: unknown, label: string): boolean {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  throw badRequest(`${label} filter is not valid`);
}

function amount(v: unknown, label: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 9999999999.99) throw badRequest(`${label} is not valid`);
  return Math.round(n * 100) / 100;
}

/** Validates and canonicalises. Unknown keys are ignored (the client may send other query parameters). Blank values count as not set. */
export function parseItemFilter(raw: Record<string, unknown>): ItemFilter {
  const f: ItemFilter = {};
  const get = (k: string) => (KNOWN.has(k) && !blank(raw[k]) ? raw[k] : undefined);

  const status = get('status');
  if (status !== undefined) {
    const values = list(status, 'Status').map(s => s.trim()).filter(Boolean);
    if (!values.every(isItemStatus)) throw badRequest('Invalid status filter');
    if (values.length > 0) f.status = [...new Set(values)];
  }
  const categoryId = get('categoryId'); if (categoryId !== undefined) f.categoryId = posInt(categoryId, 'categoryId');
  const locationId = get('locationId'); if (locationId !== undefined) f.locationId = posInt(locationId, 'locationId');
  const sub = get('sub'); if (sub !== undefined && bool(sub, 'Sub-places')) f.sub = true;

  const archived = get('archived');
  if (archived !== undefined) {
    if (archived === 'true' || archived === true || archived === 'include') f.archived = 'include';
    else if (archived === 'only') f.archived = 'only';
    else if (archived !== 'false' && archived !== false) throw badRequest('Invalid archived filter');
  }

  const search = get('search');
  if (search !== undefined) {
    if (typeof search !== 'string') throw badRequest('Search must be text');
    const q = search.trim().slice(0, 100);
    if (q) f.search = q;
  }

  const tags = get('tags');
  if (tags !== undefined) {
    const parsed = parseTags(list(tags, 'Tags').map(t => t.trim()).filter(Boolean));
    if (parsed && parsed.length > 0) f.tags = parsed;
  }

  const currency = get('currency');
  if (currency !== undefined) {
    if (!isCurrency(currency)) throw badRequest('Invalid currency filter');
    f.currency = currency;
  }
  const vmin = get('valueMin'); if (vmin !== undefined) f.valueMin = amount(vmin, 'Minimum value');
  const vmax = get('valueMax'); if (vmax !== undefined) f.valueMax = amount(vmax, 'Maximum value');
  if ((f.valueMin !== undefined || f.valueMax !== undefined) && f.currency === undefined) {
    throw badRequest('Choose a currency to filter by value');
  }
  if (f.valueMin !== undefined && f.valueMax !== undefined && f.valueMin > f.valueMax) {
    throw badRequest('Minimum value is higher than maximum value');
  }

  const warranty = get('warranty');
  if (warranty !== undefined) {
    if (typeof warranty !== 'string' || !(WARRANTY_FILTERS as readonly string[]).includes(warranty)) throw badRequest('Invalid warranty filter');
    f.warranty = warranty as WarrantyFilter;
  }
  const from = get('purchasedFrom'); if (from !== undefined) f.purchasedFrom = parseOptionalDate(from, 'Purchased from') ?? undefined;
  const to = get('purchasedTo'); if (to !== undefined) f.purchasedTo = parseOptionalDate(to, 'Purchased to') ?? undefined;
  if (f.purchasedFrom && f.purchasedTo && f.purchasedFrom > f.purchasedTo) throw badRequest('"Purchased from" is after "Purchased to"');

  const hasPhoto = get('hasPhoto'); if (hasPhoto !== undefined) f.hasPhoto = bool(hasPhoto, 'Photo');
  const hasDocs = get('hasDocuments'); if (hasDocs !== undefined) f.hasDocuments = bool(hasDocs, 'Documents');

  const sort = get('sort');
  if (sort !== undefined) {
    if (typeof sort !== 'string' || !Object.prototype.hasOwnProperty.call(ITEM_SORTS, sort)) throw badRequest('Invalid sort');
    f.sort = sort;
  }
  return f;
}

export interface BuiltItemQuery {
  /** Goes before the shared SELECT (a WITH clause or empty). */
  prefix: string;
  /** The whole WHERE condition, without the word WHERE. */
  where: string;
  params: unknown[];
  orderBy: string;
}

export function buildItemQuery(filter: ItemFilter, userId: number): BuiltItemQuery {
  const params: unknown[] = [userId];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = ['i.user_id = $1'];
  let prefix = '';

  if (filter.archived === 'only') where.push('i.archived = true');
  else if (filter.archived !== 'include') where.push('i.archived = false');

  if (filter.status) where.push(`i.status = ANY(${add(filter.status)}::item_status[])`);
  if (filter.categoryId !== undefined) where.push(`i.category_id = ${add(filter.categoryId)}`);
  if (filter.locationId !== undefined) {
    if (filter.sub) {
      prefix = `WITH RECURSIVE place_scope AS (
        SELECT id FROM locations WHERE id = ${add(filter.locationId)} AND user_id = $1
        UNION
        SELECT l.id FROM locations l JOIN place_scope s ON l.parent_id = s.id WHERE l.user_id = $1
      ) `;
      where.push('i.location_id IN (SELECT id FROM place_scope)');
    } else {
      where.push(`i.location_id = ${add(filter.locationId)}`);
    }
  }
  if (filter.search) {
    const p = add(`%${escapeLike(filter.search)}%`);
    where.push(`(i.name ILIKE ${p} OR i.brand ILIKE ${p} OR i.model ILIKE ${p} OR i.serial_number ILIKE ${p}
      OR EXISTS (SELECT 1 FROM unnest(i.tags) tg WHERE tg ILIKE ${p}))`);
  }
  if (filter.tags) {
    for (const tag of filter.tags) {
      where.push(`EXISTS (SELECT 1 FROM unnest(i.tags) tg WHERE lower(tg) = lower(${add(tag)}))`);
    }
  }
  if (filter.currency) where.push(`i.currency = ${add(filter.currency)}`);
  if (filter.valueMin !== undefined) where.push(`i.value >= ${add(filter.valueMin)}`);
  if (filter.valueMax !== undefined) where.push(`i.value <= ${add(filter.valueMax)}`);

  switch (filter.warranty) {
    case 'expired': where.push('i.warranty_expiration < CURRENT_DATE'); break;
    case 'expiring30': where.push("i.warranty_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'"); break;
    case 'expiring90': where.push("i.warranty_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'"); break;
    case 'active': where.push('i.warranty_expiration >= CURRENT_DATE'); break;
    case 'none': where.push('i.warranty_expiration IS NULL'); break;
    default: break;
  }
  if (filter.purchasedFrom) where.push(`i.purchase_date >= ${add(filter.purchasedFrom)}::date`);
  if (filter.purchasedTo) where.push(`i.purchase_date <= ${add(filter.purchasedTo)}::date`);

  const photoExpr = `(i.image_updated_at IS NOT NULL OR i.photo_url IS NOT NULL OR EXISTS (SELECT 1 FROM item_photos fp WHERE fp.item_id = i.id))`;
  if (filter.hasPhoto === true) where.push(photoExpr);
  if (filter.hasPhoto === false) where.push(`NOT ${photoExpr}`);
  const docExpr = 'EXISTS (SELECT 1 FROM item_documents fd WHERE fd.item_id = i.id)';
  if (filter.hasDocuments === true) where.push(docExpr);
  if (filter.hasDocuments === false) where.push(`NOT ${docExpr}`);

  return { prefix, where: where.join(' AND '), params, orderBy: ITEM_SORTS[filter.sort ?? 'name'] };
}
