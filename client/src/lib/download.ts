/**
 * Saving a JSON document from the browser. Pure helpers plus one DOM call:
 * the file is built in memory (Blob) and handed to the browser through a
 * temporary object URL, so nothing is uploaded anywhere and nothing is kept.
 */

/** `kepo-export-YYYY-MM-DD.json`, dated in UTC to match the server's own file name. */
export function exportFileName(now: Date): string {
  return `kepo-export-${now.toISOString().slice(0, 10)}.json`;
}

/** Serialises `data` as readable JSON (2-space indent, UTF-8, trailing newline). */
export function toJsonText(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** `kepo-export-YYYY-MM-DD-items.csv`, dated in UTC. */
export function exportCsvFileName(now: Date): string {
  return `kepo-export-${now.toISOString().slice(0, 10)}-items.csv`;
}

/** Starts a browser download of `data` as `filename`. */
export function saveJsonFile(filename: string, data: unknown): void {
  saveTextFile(filename, toJsonText(data), 'application/json;charset=utf-8');
}

/** Starts a browser download of `text` as `filename` (built in memory, nothing is uploaded). */
export function saveTextFile(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start reading the blob before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * True inside the Capacitor Android/iOS shell. Capacitor's native runtime defines
 * `window.Capacitor`; a plain browser does not, so no package import is needed.
 * The browser download in `saveJsonFile` is not handled by that shell's web view
 * (no download listener), so callers use this to avoid reporting a success that
 * did not happen.
 */
export function isNativeApp(scope: unknown = typeof window === 'undefined' ? undefined : window): boolean {
  try {
    const cap = (scope as { Capacitor?: { isNativePlatform?: () => boolean } } | undefined)?.Capacitor;
    return typeof cap?.isNativePlatform === 'function' && cap.isNativePlatform() === true;
  } catch {
    return false;
  }
}
