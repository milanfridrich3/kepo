/** Tags typed as "garage, tools, blue" → clean list (same rules as the server: trimmed, no duplicates ignoring case). */
export const MAX_TAGS_CLIENT = 10;
export const MAX_TAG_LENGTH_CLIENT = 30;

export function parseTagInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of text.split(/[,;\n]/)) {
    const tag = piece.trim().replace(/\s+/g, ' ');
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export const formatTagInput = (tags: string[]) => tags.join(', ');
