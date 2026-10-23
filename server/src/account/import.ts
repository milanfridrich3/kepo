import { parseCsv, unprotectCell } from './csv';
import { HttpError } from '../utils/errors';
import {
  parseRequiredString, parseOptionalString, parseOptionalDate, parseOptionalMoney,
  parseOptionalHttpUrl, parseOptionalCurrency, isItemStatus, parseQuantity, parseTags, splitTagText,
} from '../utils/validation';
import { EXPORT_FORMAT } from './export';
import type { Currency, ItemStatus } from '../types';

/**
 * Import of items from a Kepo JSON export, a plain JSON array, or a CSV file
 * (the columns `itemsToCsv` writes). Pure: it parses and validates and returns
 * clean rows plus per-row problems. The route decides what to write.
 *
 * Rules (also in docs/DATA-EXPORT.md):
 *  - every row is validated with the same functions the item form uses;
 *  - a bad row is rejected as a whole and reported with its row number, the
 *    other rows still import;
 *  - archived rows are skipped (they were removed on purpose);
 *  - "borrowed" becomes "with_me": loans are not imported, and an item cannot
 *    be "borrowed" without a loan;
 *  - unknown categories are dropped with a warning (the category list is fixed);
 *  - locations are given as a path "Home → Garage → Shelf"; the route creates
 *    missing ones for this user only.
 */

export const IMPORT_MAX_ROWS = 500;
// The API's JSON body limit is 100 kB; leave room for the JSON wrapper.
export const IMPORT_MAX_CHARS = 90_000;
export const LOCATION_PATH_SEPARATORS = /\s*(?:→|>)\s*/;
export const MAX_LOCATION_DEPTH = 6;

export interface ImportRow {
  name: string;
  category: string | null;
  status: ItemStatus;
  locationPath: string[]; // empty = no location
  purchaseDate: string | null;
  value: number | null;
  currency: Currency | undefined;
  warrantyExpiration: string | null;
  serialNumber: string | null;
  notes: string | null;
  photoUrl: string | null;
  quantity: number;
  brand: string | null;
  model: string | null;
  tags: string[];
}

export interface ImportProblem {
  /** 1-based position among the data rows (header excluded). */
  row: number;
  level: 'error' | 'warning';
  message: string;
}

export interface ImportResult {
  format: 'csv' | 'json';
  /** Rows that passed validation, with their original row number. */
  rows: { row: number; data: ImportRow }[];
  problems: ImportProblem[];
  skippedArchived: number;
  /** Set when the file as a whole cannot be read; then rows is empty. */
  fatal: string | null;
}

const HEADER_ALIASES: Record<string, string> = {
  name: 'name', item: 'name', title: 'name',
  category: 'category',
  status: 'status',
  location: 'location', locationpath: 'location',
  purchasedate: 'purchaseDate',
  value: 'value', price: 'value',
  currency: 'currency',
  warrantyexpiration: 'warrantyExpiration', warranty: 'warrantyExpiration', warrantyend: 'warrantyExpiration',
  serialnumber: 'serialNumber', serial: 'serialNumber',
  notes: 'notes', description: 'notes',
  photolink: 'photoLink', photourl: 'photoLink',
  archived: 'archived',
  quantity: 'quantity', qty: 'quantity', pieces: 'quantity',
  brand: 'brand', manufacturer: 'brand',
  model: 'model',
  tags: 'tags', labels: 'tags',
};

const empty = (fatal: string, format: 'csv' | 'json' = 'csv'): ImportResult =>
  ({ format, rows: [], problems: [], skippedArchived: 0, fatal });

export function splitLocationPath(raw: string): string[] {
  return raw.split(LOCATION_PATH_SEPARATORS).map(s => s.trim()).filter(s => s.length > 0);
}

/** Raw field bag (all strings/unknown) → validated row, or throws HttpError with a readable message. */
function validateRow(f: Record<string, unknown>, categories: Map<string, string>, warnings: string[], fromCsv: boolean): ImportRow {
  // Only CSV cells carry the formula-protection apostrophe added by the CSV export.
  const text = (v: unknown) => (fromCsv && typeof v === 'string' ? unprotectCell(v) : v);
  const name = parseRequiredString(text(f.name), 'Name', 200);

  let status: ItemStatus = 'with_me';
  const rawStatus = typeof f.status === 'string' ? f.status.trim().toLowerCase() : '';
  if (rawStatus !== '') {
    if (!isItemStatus(rawStatus)) throw new HttpError(400, `Status "${String(f.status).slice(0, 30)}" is not valid`);
    status = rawStatus;
  }
  if (status === 'borrowed') {
    status = 'with_me';
    warnings.push('Status "borrowed" was imported as "with_me": loans are not imported.');
  }

  let category: string | null = null;
  const rawCat = parseOptionalString(text(f.category), 'Category', 100);
  if (rawCat !== null) {
    const known = categories.get(rawCat.toLowerCase());
    if (known) category = known;
    else warnings.push(`Category "${rawCat}" does not exist and was left empty.`);
  }

  const locRaw = parseOptionalString(text(f.location), 'Location', 700);
  const locationPath = locRaw === null ? [] : splitLocationPath(locRaw);
  if (locationPath.length > MAX_LOCATION_DEPTH) throw new HttpError(400, `Location is nested deeper than ${MAX_LOCATION_DEPTH} levels`);
  for (const part of locationPath) {
    if (part.length > 100) throw new HttpError(400, 'A location name is longer than 100 characters');
  }

  const purchaseDate = parseOptionalDate(blankToNull(f.purchaseDate), 'Purchase date');
  const warrantyExpiration = parseOptionalDate(blankToNull(f.warrantyExpiration), 'Warranty end date');
  if (purchaseDate && warrantyExpiration && warrantyExpiration < purchaseDate) {
    throw new HttpError(400, 'The warranty end date is before the purchase date');
  }

  const currencyRaw = typeof f.currency === 'string' ? f.currency.trim().toUpperCase() : f.currency;
  return {
    name,
    category,
    status,
    locationPath,
    purchaseDate,
    value: parseOptionalMoney(typeof f.value === 'string' ? f.value.trim().replace(',', '.') : f.value, 'Value'),
    currency: parseOptionalCurrency(currencyRaw === '' ? undefined : currencyRaw),
    warrantyExpiration,
    serialNumber: parseOptionalString(text(f.serialNumber), 'Serial number', 100),
    notes: parseOptionalString(text(f.notes), 'Notes', 5000),
    photoUrl: parseOptionalHttpUrl(text(f.photoLink), 'Photo link'),
    quantity: parseQuantity(f.quantity) ?? 1,
    brand: parseOptionalString(text(f.brand), 'Brand', 100),
    model: parseOptionalString(text(f.model), 'Model', 100),
    tags: parseTags(typeof f.tags === 'string' ? splitTagText(text(f.tags) as string) : f.tags) ?? [],
  };
}

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : typeof v === 'string' ? v.trim() : v);

const isArchivedFlag = (v: unknown) => v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');

/** `categoryNames`: the names that exist in the (shared) categories table. */
export function parseItemImport(content: string, categoryNames: string[]): ImportResult {
  if (typeof content !== 'string' || content.trim() === '') return empty('The file is empty.');
  if (content.length > IMPORT_MAX_CHARS) {
    return empty(`The file is too large (limit ${IMPORT_MAX_CHARS.toLocaleString('en-US')} characters, about ${IMPORT_MAX_ROWS} items). Split it into smaller files.`);
  }
  const categories = new Map(categoryNames.map(n => [n.toLowerCase(), n]));
  const trimmed = content.replace(/^﻿/, '').trimStart();

  let format: 'csv' | 'json';
  let bags: Record<string, unknown>[];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    format = 'json';
    let doc: unknown;
    try {
      doc = JSON.parse(trimmed);
    } catch {
      return empty('The file looks like JSON but cannot be read.', 'json');
    }
    let list: unknown;
    if (Array.isArray(doc)) list = doc;
    else if (doc && typeof doc === 'object' && (doc as { format?: unknown }).format === EXPORT_FORMAT) {
      const v = (doc as { version?: unknown }).version;
      if (v !== 1) return empty(`Export version ${String(v)} is not supported by this app.`, 'json');
      list = (doc as { items?: unknown }).items;
    } else {
      return empty('This JSON is not a Kepo export or a list of items.', 'json');
    }
    if (!Array.isArray(list)) return empty('The export has no list of items.', 'json');
    bags = list.map(x => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
      const o = x as Record<string, unknown>;
      // A Kepo export names the location "locationPath" and the category "category".
      return { ...o, location: o.location ?? o.locationPath };
    });
  } else {
    format = 'csv';
    const parsed = parseCsv(trimmed);
    if (parsed.error) return empty(parsed.error);
    if (parsed.rows.length < 2) return empty('The file needs a header row and at least one item.');
    const header = parsed.rows[0].map(h => HEADER_ALIASES[h.trim().toLowerCase().replace(/[\s_-]/g, '')] ?? null);
    if (!header.includes('name')) return empty('The header must contain a "name" column.');
    bags = parsed.rows.slice(1).map(cells => {
      const o: Record<string, unknown> = {};
      header.forEach((key, idx) => { if (key && cells[idx] !== undefined) o[key] = cells[idx]; });
      return o;
    });
  }

  if (bags.length === 0) return empty('The file contains no items.', format);
  if (bags.length > IMPORT_MAX_ROWS) {
    return empty(`The file has ${bags.length} items; the limit is ${IMPORT_MAX_ROWS} per import.`, format);
  }

  const result: ImportResult = { format, rows: [], problems: [], skippedArchived: 0, fatal: null };
  bags.forEach((bag, idx) => {
    const row = idx + 1;
    if (isArchivedFlag(bag.archived)) { result.skippedArchived++; return; }
    const warnings: string[] = [];
    try {
      const data = validateRow(bag, categories, warnings, format === 'csv');
      result.rows.push({ row, data });
      for (const message of warnings) result.problems.push({ row, level: 'warning', message });
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      result.problems.push({ row, level: 'error', message: err.message });
    }
  });
  return result;
}
