import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { InsightsData } from '../types';
import { useData } from '../context/DataContext';
import { useI18n } from '../context/I18nContext';
import { PageHeader, Section } from '../components/ui/Card';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { categoryLabel, fmtDate, fmtMoney, statusLabel } from '../lib/format';
import { formatNumber } from '../lib/intl';

/** One labelled row with a proportional bar. `max` is the biggest count of the group. */
function BarRow({ label, count, max, detail }: { label: string; count: number; max: number; detail?: string }) {
  const { lang: language } = useI18n();
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  return (
    <li className="px-4 py-2">
      <div className="flex items-baseline justify-between gap-3 text-body">
        <span className="min-w-0 truncate text-ink">{label}</span>
        <span className="shrink-0 tabular-nums text-muted">{formatNumber(count, language)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      {detail && <div className="mt-1 truncate text-caption text-muted">{detail}</div>}
    </li>
  );
}

function BarList({ rows }: { rows: { key: string; label: string; count: number; detail?: string }[] }) {
  const max = Math.max(0, ...rows.map(r => r.count));
  return (
    <ul className="pb-2">
      {rows.map(r => <BarRow key={r.key} label={r.label} count={r.count} max={max} detail={r.detail} />)}
    </ul>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-surface p-4">
      <div className="text-meta text-muted">{label}</div>
      <div className="mt-2 text-[1.5rem] font-semibold leading-none tracking-tight tabular-nums text-ink">{value}</div>
      {note && <div className="mt-2 text-caption text-muted">{note}</div>}
    </div>
  );
}

export function Insights() {
  const { t, lang: language } = useI18n();
  const { version } = useData();
  const [data, setData] = useState<InsightsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.insights().then(setData).catch(err => setError(err.message || t('insights.loadFailed')));
  }, [t]);
  useEffect(() => { load(); }, [load, version]);

  if (error) return (<><PageHeader title={t('insights.title')} /><ErrorState message={error} onRetry={load} /></>);
  if (!data) return (
    <div role="status" aria-label={t('common.loading')} className="space-y-4">
      <PageHeader title={t('insights.title')} />
      <Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full" />
    </div>
  );
  if (data.itemCount === 0) return (
    <div>
      <PageHeader title={t('insights.title')} subtitle={t('insights.subtitle')} />
      <EmptyState icon="dashboard" title={t('insights.empty.title')} body={t('insights.empty.body')} />
    </div>
  );

  const w = data.warranties;
  const loanDetail = data.openLoans.oldest
    ? t('insights.oldestLoan', { item: data.openLoans.oldest.itemName, name: data.openLoans.oldest.borrowerName, date: fmtDate(data.openLoans.oldest.lentDate) })
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t('insights.title')} subtitle={t('insights.subtitle')} />

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        <Tile label={t('insights.items')} value={formatNumber(data.itemCount, language)} />
        {data.valueByCurrency.map(v => (
          <Tile key={v.currency} label={t('insights.value', { currency: v.currency })} value={fmtMoney(v.total, v.currency)}
            note={t('insights.valueNote', { count: v.itemsWithValue })} />
        ))}
        <Tile label={t('insights.openLoans')} value={formatNumber(data.openLoans.count, language)}
          note={data.openLoans.overdue > 0 ? t('insights.overdue', { count: data.openLoans.overdue }) : undefined} />
      </div>
      {(data.valueByCurrency.length > 1 || data.itemsWithoutValue > 0) && (
        <p className="-mt-3 text-caption text-muted">
          {data.valueByCurrency.length > 1 && <>{t('insights.currencyNote')} </>}
          {data.itemsWithoutValue > 0 && t('insights.noValue', { count: data.itemsWithoutValue })}
        </p>
      )}
      {loanDetail && <Link to="/borrowed" className="block text-meta text-accent-ink hover:underline">{loanDetail}</Link>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('insights.byStatus')}>
          <BarList rows={data.byStatus.map(s => ({ key: s.status, label: statusLabel(s.status), count: s.count }))} />
        </Section>
        <Section title={t('insights.byCategory')}>
          <BarList rows={[
            ...data.byCategory.filter(c => c.category !== null).map(c => ({ key: c.category!, label: categoryLabel(c.category), count: c.count })),
            ...(data.uncategorized > 0 ? [{ key: '__none', label: t('insights.uncategorized'), count: data.uncategorized }] : []),
          ]} />
        </Section>
        <Section title={t('insights.byPlace')}>
          <BarList rows={data.byRootLocation.map(l => ({
            key: l.location ?? '__none',
            label: l.location ?? t('insights.unplaced'),
            count: l.count,
            detail: l.valueByCurrency.map(v => fmtMoney(v.total, v.currency)).join(' · ') || undefined,
          }))} />
        </Section>
        <Section title={t('insights.warranties')}>
          <BarList rows={[
            { key: 'expired', label: t('insights.warranty.expired'), count: w.expired },
            { key: 'next30', label: t('insights.warranty.next30'), count: w.next30 },
            { key: 'next90', label: t('insights.warranty.next90'), count: w.next90 },
            { key: 'none', label: t('insights.warranty.none'), count: w.none },
          ]} />
        </Section>
      </div>

      {data.mostValuable.map(group => (
        <Section key={group.currency} title={t('insights.mostValuable', { currency: group.currency })}>
          <ul className="divide-y divide-line">
            {group.items.map(i => (
              <li key={i.id}>
                <Link to={`/items/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-hover">
                  <span className="min-w-0 truncate text-body text-ink">{i.name}</span>
                  <span className="shrink-0 tabular-nums text-muted">{fmtMoney(i.value, group.currency)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}
