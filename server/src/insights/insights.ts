import type { Currency, ItemStatus } from '../types';

/**
 * "Kepo Insights": numbers computed from the person's own data. Pure and
 * deterministic (`today` is passed in). Money is never converted or added
 * across currencies: every total is reported per currency.
 */

export interface InsightItem {
  id: number;
  name: string;
  categoryName: string | null;
  status: ItemStatus;
  locationId: number | null;
  value: number | null;
  currency: Currency;
  purchaseDate: string | null;
  warrantyExpiration: string | null;
}

export interface InsightLocation { id: number; name: string; parentId: number | null }

export interface InsightLoan {
  itemId: number;
  itemName: string;
  borrowerName: string;
  lentDate: string;
  expectedReturnDate: string | null;
}

export interface Insights {
  itemCount: number;
  valueByCurrency: { currency: Currency; total: number; itemsWithValue: number }[];
  itemsWithoutValue: number;
  byStatus: { status: ItemStatus; count: number }[];
  byCategory: { category: string | null; count: number }[];
  /** Top-level place an item sits in ("Home", "Office"), counting everything nested below it. */
  byRootLocation: { location: string | null; count: number; valueByCurrency: { currency: Currency; total: number }[] }[];
  unplaced: number;
  uncategorized: number;
  warranties: { expired: number; next30: number; next90: number; none: number };
  openLoans: { count: number; overdue: number; oldest: { itemName: string; borrowerName: string; lentDate: string } | null };
  /** Top 3 per currency; amounts in different currencies are never ranked against each other. */
  mostValuable: { currency: Currency; items: { id: number; name: string; value: number }[] }[];
}

const dayNumber = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
};

/** Alphabetical, with "none" (null) after every named entry. */
const nullLast = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b);

const cents = (n: number) => Math.round(n * 100);

function sumByCurrency(items: InsightItem[]): { currency: Currency; total: number; itemsWithValue: number }[] {
  const map = new Map<Currency, { cents: number; n: number }>();
  for (const i of items) {
    if (i.value === null) continue;
    const cur = map.get(i.currency) ?? { cents: 0, n: 0 };
    cur.cents += cents(i.value); // integer cents: no floating-point drift across many rows
    cur.n++;
    map.set(i.currency, cur);
  }
  return [...map.entries()]
    .map(([currency, v]) => ({ currency, total: v.cents / 100, itemsWithValue: v.n }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

/** `items` = active (not archived) items only; the route filters. */
export function computeInsights(
  items: InsightItem[], locations: InsightLocation[], loans: InsightLoan[], today: string
): Insights {
  const byId = new Map(locations.map(l => [l.id, l]));
  const rootOf = (id: number | null): string | null => {
    const seen = new Set<number>();
    let cur = id === null ? undefined : byId.get(id);
    let name: string | null = null;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      name = cur.name;
      cur = cur.parentId === null ? undefined : byId.get(cur.parentId);
    }
    return name;
  };

  const statusCount = new Map<ItemStatus, number>();
  const catCount = new Map<string | null, number>();
  const rootItems = new Map<string | null, InsightItem[]>();
  const t = dayNumber(today);
  const warranties = { expired: 0, next30: 0, next90: 0, none: 0 };

  for (const i of items) {
    statusCount.set(i.status, (statusCount.get(i.status) ?? 0) + 1);
    catCount.set(i.categoryName, (catCount.get(i.categoryName) ?? 0) + 1);
    const root = rootOf(i.locationId);
    rootItems.set(root, [...(rootItems.get(root) ?? []), i]);
    if (i.warrantyExpiration === null) warranties.none++;
    else {
      const days = dayNumber(i.warrantyExpiration) - t;
      if (days < 0) warranties.expired++;
      else if (days <= 30) warranties.next30++;
      else if (days <= 90) warranties.next90++;
    }
  }

  const overdue = loans.filter(l => l.expectedReturnDate !== null && dayNumber(l.expectedReturnDate) < t).length;
  const oldest = [...loans].sort((a, b) => a.lentDate.localeCompare(b.lentDate) || a.itemId - b.itemId)[0];

  return {
    itemCount: items.length,
    valueByCurrency: sumByCurrency(items),
    itemsWithoutValue: items.filter(i => i.value === null).length,
    byStatus: [...statusCount.entries()].map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status)),
    byCategory: [...catCount.entries()].map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || nullLast(a.category, b.category)),
    byRootLocation: [...rootItems.entries()].map(([location, list]) => ({
      location,
      count: list.length,
      valueByCurrency: sumByCurrency(list).map(({ currency, total }) => ({ currency, total })),
    })).sort((a, b) => b.count - a.count || nullLast(a.location, b.location)),
    unplaced: items.filter(i => i.locationId === null).length,
    uncategorized: items.filter(i => i.categoryName === null).length,
    warranties,
    openLoans: {
      count: loans.length,
      overdue,
      oldest: oldest ? { itemName: oldest.itemName, borrowerName: oldest.borrowerName, lentDate: oldest.lentDate } : null,
    },
    mostValuable: sumByCurrency(items).map(({ currency }) => ({
      currency,
      items: items.filter(i => i.currency === currency && i.value !== null && i.value > 0)
        .sort((a, b) => b.value! - a.value! || a.id - b.id)
        .slice(0, 3)
        .map(i => ({ id: i.id, name: i.name, value: i.value as number })),
    })).filter(g => g.items.length > 0),
  };
}
