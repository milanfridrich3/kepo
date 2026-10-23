/**
 * Kepo label codes. A label QR contains plain text so any phone can show it and the scanner in
 * the app can route it: `kepo:i:<item id>` or `kepo:l:<location id>`. A full app address such as
 * https://app.kepo.is-cool.dev/items/12 is accepted too (the app's own origin or any path).
 * Ids are only pointers; opening one still goes through the normal signed-in, per-user access check.
 */
export type KepoTarget = { kind: 'item' | 'location'; id: number };

export const itemCode = (id: number) => `kepo:i:${id}`;
export const locationCode = (id: number) => `kepo:l:${id}`;

const ID = /^[1-9]\d{0,9}$/;

export function parseKepoCode(raw: string): KepoTarget | null {
  const text = raw.trim();
  const m = /^kepo:([il]):(\d+)$/i.exec(text);
  if (m) return ID.test(m[2]) ? { kind: m[1].toLowerCase() === 'i' ? 'item' : 'location', id: Number(m[2]) } : null;
  const u = /^https?:\/\/[^/\s]+\/(items|locations)\/(\d+)\/?(?:[?#].*)?$/i.exec(text);
  if (u) return ID.test(u[2]) ? { kind: u[1].toLowerCase() === 'items' ? 'item' : 'location', id: Number(u[2]) } : null;
  return null;
}

export function targetPath(t: KepoTarget): string {
  return t.kind === 'item' ? `/items/${t.id}` : `/stuff?locationId=${t.id}`;
}

/** What to do with scanned or typed text: open a Kepo item/place, or search items by it (serial numbers, product barcodes you typed in as a serial). */
export type ScanOutcome = { kind: 'open'; path: string } | { kind: 'search'; path: string } | { kind: 'empty' };

export function resolveScan(raw: string): ScanOutcome {
  const text = raw.trim();
  if (!text) return { kind: 'empty' };
  const target = parseKepoCode(text);
  if (target) return { kind: 'open', path: targetPath(target) };
  return { kind: 'search', path: `/stuff?search=${encodeURIComponent(text.slice(0, 100))}` };
}
