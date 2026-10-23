/**
 * Builds a "Garage → Shelf 2" style path for a location id from a flat list of
 * a user's locations. Cycle-safe: if bad data ever made a place its own
 * ancestor, the walk stops at the first repeated place instead of looping
 * forever (an endless loop here would block the whole single-threaded API).
 */
export function buildPathResolver(
  locations: { id: number; name: string; parent_id: number | null }[],
  unassigned = 'Unassigned',
): (id: number | null) => string {
  const byId = new Map(locations.map(l => [l.id, l]));
  return (id: number | null): string => {
    if (id === null) return unassigned;
    const chain: string[] = [];
    const seen = new Set<number>();
    let cur = byId.get(id);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.unshift(cur.name);
      cur = cur.parent_id !== null ? byId.get(cur.parent_id) : undefined;
    }
    return chain.length ? chain.join(' → ') : unassigned;
  };
}
