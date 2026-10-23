import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { AttentionItem, Borrowing, DashboardData, Location, WarrantyBuckets } from '../types';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useAddItem } from '../context/AddItemContext';
import { Section } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import type { IconName } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { useI18n } from '../context/I18nContext';
import { categoryLabel, dueLabel, daysUntil, firstName, fmtShort, greeting, pathStr, relativeDay, warrantyDaysLabel } from '../lib/format';
import { formatDateTime } from '../lib/intl';

interface Bundle {
  dash: DashboardData;
  borrowings: Borrowing[];
  warranties: WarrantyBuckets;
  locations: Location[];
}

interface Activity {
  key: string;
  at: string;
  icon: IconName;
  itemId: number;
  text: string;
  detail?: string;
}

function Stat({ to, label, value, icon }: { to: string; label: string; value: number; icon: IconName }) {
  return (
    <Link to={to} className="group bg-surface p-4 transition hover:bg-hover active:bg-hover">
      <div className="flex items-center justify-between text-muted">
        <span className="text-meta">{label}</span>
        <Icon name={icon} className="h-4 w-4 text-faint transition group-hover:text-muted" />
      </div>
      <div className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</div>
    </Link>
  );
}

function RowLink({ to, icon, title, detail, tone = 'muted' }: { to: string; icon?: IconName; title: string; detail?: ReactNode; tone?: 'muted' | 'warning' }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-hover active:bg-hover">
      {icon && (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-sunken text-muted">
          <Icon name={icon} className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-ink">{title}</div>
        {detail && <div className={`truncate text-meta ${tone === 'warning' ? 'text-warning' : 'text-muted'}`}>{detail}</div>}
      </div>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-faint" />
    </Link>
  );
}

function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-4 pt-1 text-meta text-muted">{children}</p>;
}

function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('dashboard.loading')} className="space-y-6">
      <Skeleton className="h-16 w-2/3" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { version } = useData();
  const { openAddItem } = useAddItem();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.dashboard(), api.borrowings(), api.warranties(), api.locations()])
      .then(([dash, b, warranties, l]) => setBundle({ dash, borrowings: b.borrowings, warranties, locations: l.locations }))
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const activity = useMemo<Activity[]>(() => {
    if (!bundle) return [];
    const added: Activity[] = bundle.dash.recentlyAdded.map(item => ({
      key: `a${item.id}`,
      at: item.createdAt,
      icon: 'plus',
      itemId: item.id,
      text: t('dashboard.activity.added', { name: item.name }),
      detail: item.categoryName ? categoryLabel(item.categoryName) : undefined,
    }));
    const moved: Activity[] = bundle.dash.recentlyMoved.map(move => ({
      key: `m${move.id}`,
      at: move.movedAt,
      icon: 'move',
      itemId: move.itemId,
      text: t('dashboard.activity.moved', { name: move.itemName }),
      detail: `${pathStr(move.fromLocationId, bundle.locations)} → ${pathStr(move.toLocationId, bundle.locations)}`,
    }));
    return [...added, ...moved].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  }, [bundle, t]);

  const attentionText = (entry: AttentionItem): string => {
    if (entry.type === 'overdue') {
      return entry.borrowerName
        ? t('dashboard.attention.overdue', { borrowerName: entry.borrowerName, itemName: entry.itemName })
        : t('dashboard.attention.overdueNoName', { itemName: entry.itemName });
    }
    const days = entry.days;
    if (days === undefined) return t('dashboard.attention.warrantyFallback', { itemName: entry.itemName });
    if (days < 0) return t('dashboard.attention.warrantyExpired', { itemName: entry.itemName });
    if (days === 0) return t('dashboard.attention.warrantyToday', { itemName: entry.itemName });
    return t('dashboard.attention.warranty', { itemName: entry.itemName, count: days });
  };

  const name = firstName(user?.name);
  const today = formatDateTime(new Date(), lang, { weekday: 'long', day: 'numeric', month: 'long' });

  const header = (
    <div className="mb-6">
      <p className="text-meta text-muted">{today}</p>
      <h1 className="text-title text-ink">
        {greeting()}
        {name ? `, ${name}` : ''}
      </h1>
    </div>
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }
  if (!bundle) return <DashboardSkeleton />;

  const { dash, borrowings, warranties } = bundle;

  if (dash.totalItems === 0) {
    return (
      <>
        {header}
        <EmptyState
          icon="items"
          title={t('dashboard.empty.title')}
          body={t('dashboard.empty.body')}
          action={
            <Button variant="primary" onClick={openAddItem}>
              {t('dashboard.empty.action')}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      <section aria-label={t('dashboard.overview')}>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4">
          <Stat to="/stuff" label={t('dashboard.stat.items')} value={dash.totalItems} icon="items" />
          <Stat to="/borrowed" label={t('dashboard.stat.lentOut')} value={dash.borrowedCount} icon="borrowed" />
          <Stat to="/locations" label={t('dashboard.stat.locations')} value={dash.totalLocations} icon="locations" />
          <Stat to="/warranties" label={t('dashboard.stat.warrantiesEnding')} value={dash.warrantiesExpiringSoonCount} icon="warranties" />
        </div>
      </section>

      {dash.attention.length > 0 && (
        <Section title={t('dashboard.attention.title')} count={dash.attention.length}>
          <div className="divide-y divide-line border-t border-line">
            {dash.attention.map((entry, index) => (
              <RowLink
                key={`${entry.type}-${entry.itemId}-${index}`}
                to={`/items/${entry.itemId}`}
                icon={entry.type === 'overdue' ? 'clock' : 'warranties'}
                title={attentionText(entry)}
                tone="warning"
              />
            ))}
          </div>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('dashboard.lent.title')} to="/borrowed">
          {borrowings.length === 0 ? (
            <SectionEmpty>{t('dashboard.lent.empty')}</SectionEmpty>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {borrowings.slice(0, 4).map(b => {
                const overdue = b.expectedReturnDate ? (daysUntil(b.expectedReturnDate) ?? 0) < 0 : false;
                return (
                  <RowLink
                    key={b.id}
                    to={`/items/${b.itemId}`}
                    title={b.itemName}
                    detail={
                      b.expectedReturnDate
                        ? t('dashboard.lent.withDue', { name: b.borrowerName, due: dueLabel(b.expectedReturnDate).toLowerCase() })
                        : t('dashboard.lent.withSince', { name: b.borrowerName, date: fmtShort(b.lentDate) })
                    }
                    tone={overdue ? 'warning' : 'muted'}
                  />
                );
              })}
            </div>
          )}
        </Section>

        <Section title={t('dashboard.warranties.title')} to="/warranties">
          {warranties.expiringSoon.length === 0 ? (
            <SectionEmpty>{t('dashboard.warranties.empty')}</SectionEmpty>
          ) : (
            <div className="divide-y divide-line border-t border-line">
              {warranties.expiringSoon.slice(0, 4).map(item => (
                <RowLink
                  key={item.id}
                  to={`/items/${item.id}`}
                  title={item.name}
                  detail={warrantyDaysLabel(daysUntil(item.warrantyExpiration) ?? 0)}
                  tone="warning"
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title={t('dashboard.recent.title')}>
        {activity.length === 0 ? (
          <SectionEmpty>{t('dashboard.recent.empty')}</SectionEmpty>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {activity.map(entry => (
              <Link key={entry.key} to={`/items/${entry.itemId}`} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-hover active:bg-hover">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-sunken text-muted">
                  <Icon name={entry.icon} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body text-ink">{entry.text}</div>
                  {entry.detail && <div className="truncate text-meta text-muted">{entry.detail}</div>}
                </div>
                <span className="shrink-0 text-caption text-muted">{relativeDay(entry.at)}</span>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
