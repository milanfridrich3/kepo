import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Item, WarrantyBuckets } from '../types';
import { useData } from '../context/DataContext';
import { Badge } from '../components/ui/Badge';
import { PageHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { Thumb } from '../components/Thumb';
import { useI18n } from '../context/I18nContext';
import { categoryLabel, warrantyDaysLabel, warrantyState } from '../lib/format';

function WarrantyRow({ item }: { item: Item }) {
  useI18n(); // re-render on language change (labels come from lib/format)
  const w = warrantyState(item.warrantyExpiration)!;
  const tone = w.tone === 'emerald' ? 'success' : w.tone === 'amber' ? 'warning' : 'neutral';
  return (
    <Link to={`/items/${item.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover active:bg-hover">
      <Thumb item={item} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-medium text-ink">{item.name}</div>
        <div className="truncate text-meta text-muted">{categoryLabel(item.categoryName)}</div>
      </div>
      <Badge tone={tone}>{warrantyDaysLabel(w.days)}</Badge>
    </Link>
  );
}

function Group({ title, items }: { title: string; items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-muted">
        {title} <span className="normal-case text-muted">· {items.length}</span>
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {items.map(item => (
          <WarrantyRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

export function Warranties() {
  const { t } = useI18n();
  const { version } = useData();
  const [buckets, setBuckets] = useState<WarrantyBuckets | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.warranties().then(setBuckets).catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  if (error) {
    return (
      <>
        <PageHeader title={t('warranties.title')} />
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }
  if (!buckets) {
    return (
      <div>
        <PageHeader title={t('warranties.title')} />
        <div role="status" aria-label={t('common.loading')} className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const total = buckets.active.length + buckets.expiringSoon.length + buckets.expired.length;

  return (
    <div>
      <PageHeader title={t('warranties.title')} />
      {total === 0 ? (
        <EmptyState
          icon="warranties"
          title={t('warranties.empty.title')}
          body={t('warranties.empty.body')}
        />
      ) : (
        <>
          <Group title={t('warranties.group.endingSoon')} items={buckets.expiringSoon} />
          <Group title={t('warranties.group.active')} items={buckets.active} />
          <Group title={t('warranties.group.expired')} items={buckets.expired} />
        </>
      )}
    </div>
  );
}
