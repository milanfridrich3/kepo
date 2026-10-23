import kepoMarkUrl from '../../assets/brand/kepo-mark.svg';

/**
 * Kepo mark — the single official brand symbol, used everywhere the Kepo
 * identity appears (sidebar, collapsed rail, mobile header, auth screens,
 * loading screen).
 *
 * The artwork lives in exactly one place: src/assets/brand/kepo-mark.svg, a
 * faithful vector trace of the final brand reference (indigo tile, white K
 * whose upper stroke ends in a location pin). This component only displays
 * that file — it never redraws it, so the geometry cannot drift between
 * screens. The favicon, PWA icons and Apple touch icon in /public are derived
 * from the same file by scripts/build-brand-assets.py.
 *
 * The mark is a fixed, self-contained graphic (indigo tile + white glyph), not
 * currentColor: it is identical in Light and Dark. Size it with className; the
 * SVG keeps its own aspect ratio inside whatever box it is given.
 */
export function KepoMark({ className = 'h-6 w-6' }: { className?: string }) {
  return <img src={kepoMarkUrl} alt="" aria-hidden="true" draggable={false} className={className} />;
}

export function Logo({ showWordmark = true, className = '' }: { showWordmark?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <KepoMark className="h-6 w-6" />
      {showWordmark && <span className="text-[17px] font-semibold leading-none tracking-tight text-ink">Kepo</span>}
    </span>
  );
}
