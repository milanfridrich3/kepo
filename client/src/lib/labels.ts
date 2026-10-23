import { itemCode, locationCode } from './codes';
import { qrMatrix } from './qr';

/** Where the camera of a phone should lead: the web app. Inside the Android app the page origin is not public, so the production app address is used. */
export const PUBLIC_APP_ORIGIN = 'https://app.kepo.is-cool.dev';

export type LabelTarget = { kind: 'item' | 'location'; id: number; title: string; subtitle: string };

/** The text stored in the QR code. A web address, so any phone camera opens Kepo; the in-app scanner reads it too. */
export function labelPayload(t: Pick<LabelTarget, 'kind' | 'id'>, origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return t.kind === 'item' ? `${base}/items/${t.id}` : `${base}/locations/${t.id}`;
}

/** The short Kepo code, printed under the QR so a label can be typed in by hand when scanning is unavailable. */
export const labelShortCode = (t: Pick<LabelTarget, 'kind' | 'id'>) => (t.kind === 'item' ? itemCode(t.id) : locationCode(t.id));

export function labelMatrix(t: Pick<LabelTarget, 'kind' | 'id'>, origin: string): boolean[][] | null {
  return qrMatrix(labelPayload(t, origin));
}
