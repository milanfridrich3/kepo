import { useMemo } from 'react';
import { qrMatrix, qrSvg } from '../lib/qr';

/** A QR code drawn as inline SVG (no image request, prints crisply). */
export function QrImage({ text, size = 120, label }: { text: string; size?: number; label: string }) {
  const svg = useMemo(() => {
    const m = qrMatrix(text);
    return m ? qrSvg(m, 4) : null;
  }, [text]);
  if (!svg) return null;
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return <img src={src} alt={label} width={size} height={size} style={{ imageRendering: 'pixelated' }} />;
}
