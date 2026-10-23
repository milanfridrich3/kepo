import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Item, Location } from '../types';
import { StatusBadge } from './ui/Badge';
import { Icon } from './ui/Icon';
import { Thumb } from './Thumb';
import { categoryLabel, dueLabel, daysUntil, shortPath, warrantyState } from '../lib/format';
import { useI18n } from '../context/I18nContext';

/** Secondary facts worth surfacing in a list: who has it, and a warranty that needs attention. */
function ItemNotes({ item }: { item: Item }) {
  const { t } = useI18n();
  const borrower = item.borrower;
  const warranty = warrantyState(item.warrantyExpiration);
  const warrantyNeedsAttention = warranty && warranty.tone !== 'emerald';
  if (!borrower && !warrantyNeedsAttention) return null;

  const overdue = borrower?.expectedReturnDate ? (daysUntil(borrower.expectedReturnDate) ?? 0) < 0 : false;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption">
      {borrower && (
        <span className={`inline-flex items-center gap-1 ${overdue ? 'text-warning' : 'text-accent-ink'}`}>
          <Icon name="borrowed" className="h-3.5 w-3.5" />
          {t('items.row.with', { name: borrower.borrowerName })}
          {borrower.expectedReturnDate ? ` · ${dueLabel(borrower.expectedReturnDate).toLowerCase()}` : ''}
        </span>
      )}
      {warrantyNeedsAttention && warranty && (
        <span className={`inline-flex items-center gap-1 ${warranty.tone === 'rose' ? 'text-muted' : 'text-warning'}`}>
          <Icon name="warranties" className="h-3.5 w-3.5" />
          {warranty.days < 0 ? t('items.row.warrantyExpired') : t('items.row.warrantyEnds', { count: warranty.days })}
        </span>
      )}
    </div>
  );
}

/** When present, the row becomes a checkbox row (bulk selection) instead of a link. */
export interface RowSelect { checked: boolean; onToggle: () => void }

export function ItemListRow({ item, locations, select, extra }: { item: Item; locations: Location[]; select?: RowSelect; extra?: ReactNode }) {
  useI18n(); // re-render when the language changes
  if (select) {
    return (
      <label className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition hover:bg-hover ${select.checked ? 'bg-accent-soft' : ''}`}>
        <input type="checkbox" checked={select.checked} onChange={select.onToggle} className="h-5 w-5 shrink-0" aria-label={item.name} />
        <Thumb item={item} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-medium text-ink">{item.name}</div>
          <div className="truncate text-meta text-muted">{categoryLabel(item.categoryName)} · {shortPath(item.locationId, locations)}</div>
        </div>
        <StatusBadge status={item.status} />
      </label>
    );
  }
  return (
    <Link
      to={`/items/${item.id}`}
      className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover active:bg-hover"
    >
      <Thumb item={item} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-ink">{item.name}</div>
        <div className="truncate text-meta text-muted">
          {categoryLabel(item.categoryName)} · {shortPath(item.locationId, locations)}
        </div>
        <ItemNotes item={item} />
      </div>
      {extra}
      <StatusBadge status={item.status} />
    </Link>
  );
}

export function ItemCard({ item, locations, select }: { item: Item; locations: Location[]; select?: RowSelect }) {
  useI18n(); // re-render when the language changes
  if (select) {
    return (
      <label className={`flex cursor-pointer flex-col overflow-hidden rounded-card border bg-surface ${select.checked ? 'border-accent' : 'border-line'}`}>
        <Thumb item={item} size="fill" />
        <div className="flex items-center gap-2 p-3">
          <input type="checkbox" checked={select.checked} onChange={select.onToggle} className="h-5 w-5 shrink-0" aria-label={item.name} />
          <span className="truncate text-body font-medium text-ink">{item.name}</span>
        </div>
      </label>
    );
  }
  return (
    <Link
      to={`/items/${item.id}`}
      className="flex flex-col overflow-hidden rounded-card border border-line bg-surface transition hover:border-line-strong active:scale-[0.99]"
    >
      <Thumb item={item} size="fill" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="truncate text-body font-medium text-ink">{item.name}</div>
        <div className="truncate text-meta text-muted">{shortPath(item.locationId, locations)}</div>
        <div className="mt-1.5">
          <StatusBadge status={item.status} />
        </div>
        <ItemNotes item={item} />
      </div>
    </Link>
  );
}

/** A bordered list container with hairline dividers; pass ItemListRow children. */
export function ListCard({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">{children}</div>;
}
