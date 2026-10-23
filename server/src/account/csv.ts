import type { AccountExport } from './export';

/**
 * CSV for spreadsheets (items list). Pure functions, no I/O.
 *
 * - RFC 4180 quoting (comma, quote, CR/LF), CRLF line ends, UTF-8 BOM so Excel
 *   reads accented text correctly.
 * - Spreadsheet formula injection: a text cell that starts with = + - @ TAB or
 *   CR would be run as a formula by Excel/Sheets, so such cells are prefixed
 *   with an apostrophe. The importer removes that apostrophe again.
 *   Number columns are written as plain numbers and are never prefixed.
 */

export const CSV_BOM = '﻿';

export const ITEM_CSV_COLUMNS = [
  'name', 'category', 'status', 'location', 'quantity', 'brand', 'model', 'tags', 'purchaseDate', 'value', 'currency',
  'warrantyExpiration', 'serialNumber', 'notes', 'photoLink', 'archived',
] as const;
export type ItemCsvColumn = (typeof ITEM_CSV_COLUMNS)[number];

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell. `text` cells are protected against formula injection, numbers are not touched. */
export function csvCell(value: unknown, kind: 'text' | 'number' = 'text'): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (kind === 'text' && FORMULA_START.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Undo the apostrophe that `csvCell` adds in front of a formula-looking text. */
export function unprotectCell(s: string): string {
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
}

export function itemsToCsv(doc: Pick<AccountExport, 'items'>): string {
  const lines = [ITEM_CSV_COLUMNS.join(',')];
  for (const i of doc.items) {
    lines.push([
      csvCell(i.name),
      csvCell(i.category),
      csvCell(i.status),
      csvCell(i.locationPath),
      csvCell(i.quantity, 'number'),
      csvCell(i.brand),
      csvCell(i.model),
      csvCell(i.tags.join('; ')),
      csvCell(i.purchaseDate),
      csvCell(i.value, 'number'),
      csvCell(i.currency),
      csvCell(i.warrantyExpiration),
      csvCell(i.serialNumber),
      csvCell(i.notes),
      csvCell(i.photoLink),
      csvCell(i.archived ? 'true' : 'false'),
    ].join(','));
  }
  return CSV_BOM + lines.join('\r\n') + '\r\n';
}

/**
 * RFC 4180 parser: quoted fields, doubled quotes, embedded newlines, CRLF/LF/CR,
 * optional BOM. Blank lines are skipped. An unterminated quote is an error
 * (returned, never thrown) so the importer can report it.
 */
export function parseCsv(text: string): { rows: string[][]; error: string | null } {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let sawAny = false;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    sawAny = true;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\r') {
      if (src[i + 1] === '\n') i++;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else field += ch;
  }
  if (inQuotes) return { rows, error: 'A quoted value is not closed (missing closing ").' };
  if (sawAny && (field !== '' || row.length > 0)) endRow();
  return { rows, error: null };
}
