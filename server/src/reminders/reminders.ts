import type { Language } from '../types';

/**
 * Smart reminders: what needs attention, computed from the person's own data.
 * Pure and deterministic (`today` is passed in as a UTC calendar date).
 *
 *  - a warranty that ends today or within the next 30 days
 *  - a loan that is overdue, or due within the next 3 days
 *
 * The same list feeds the in-app reminders and the optional daily email.
 */

export const WARRANTY_WINDOW_DAYS = 30;
export const LOAN_SOON_DAYS = 3;

export type ReminderKind = 'warranty_ending' | 'loan_overdue' | 'loan_due_soon';

export interface Reminder {
  kind: ReminderKind;
  itemId: number;
  itemName: string;
  /** The warranty end date or the loan's expected return date (YYYY-MM-DD). */
  date: string;
  /** Days from today to `date`; negative = in the past (overdue). */
  days: number;
}

export interface ReminderItem { id: number; name: string; warrantyExpiration: string | null }
export interface ReminderLoan { itemId: number; itemName: string; expectedReturnDate: string | null }

const dayNumber = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, day) / 86400000);
};

export function computeReminders(items: ReminderItem[], loans: ReminderLoan[], today: string): Reminder[] {
  const t = dayNumber(today);
  const out: Reminder[] = [];
  for (const i of items) {
    if (i.warrantyExpiration === null) continue;
    const days = dayNumber(i.warrantyExpiration) - t;
    if (days >= 0 && days <= WARRANTY_WINDOW_DAYS) {
      out.push({ kind: 'warranty_ending', itemId: i.id, itemName: i.name, date: i.warrantyExpiration, days });
    }
  }
  for (const l of loans) {
    if (l.expectedReturnDate === null) continue;
    const days = dayNumber(l.expectedReturnDate) - t;
    if (days < 0) out.push({ kind: 'loan_overdue', itemId: l.itemId, itemName: l.itemName, date: l.expectedReturnDate, days });
    else if (days <= LOAN_SOON_DAYS) out.push({ kind: 'loan_due_soon', itemId: l.itemId, itemName: l.itemName, date: l.expectedReturnDate, days });
  }
  const rank: Record<ReminderKind, number> = { loan_overdue: 0, loan_due_soon: 1, warranty_ending: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.days - b.days || a.itemId - b.itemId);
}

/** One readable line for a reminder, for emails. Plain text (callers escape for HTML). */
export function reminderLine(r: Reminder, lang: Language): string {
  const cs = lang === 'cs';
  const when = (days: number) =>
    days === 0 ? (cs ? 'dnes' : 'today')
    : days === 1 ? (cs ? 'zítra' : 'tomorrow')
    : cs ? `za ${days} dní` : `in ${days} days`;
  switch (r.kind) {
    case 'warranty_ending':
      return cs ? `Záruka na „${r.itemName}“ končí ${when(r.days)} (${r.date}).` : `The warranty on “${r.itemName}” ends ${when(r.days)} (${r.date}).`;
    case 'loan_due_soon':
      return cs ? `„${r.itemName}“ je potřeba vrátit ${when(r.days)} (${r.date}).` : `“${r.itemName}” is due back ${when(r.days)} (${r.date}).`;
    case 'loan_overdue': {
      const late = -r.days;
      return cs
        ? `„${r.itemName}“ se mělo vrátit před ${late} ${late === 1 ? 'dnem' : 'dny'} (${r.date}).`
        : `“${r.itemName}” is ${late} ${late === 1 ? 'day' : 'days'} overdue (${r.date}).`;
    }
  }
}
