import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { ReminderEntry } from '../types';
import { useData } from '../context/DataContext';
import { useI18n } from '../context/I18nContext';
import { PageHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { fmtDate } from '../lib/format';

export function reminderWhen(t: ReturnType<typeof useI18n>['t'], days: number): string {
  if (days === 0) return t('reminders.today');
  if (days === 1) return t('reminders.tomorrow');
  return t('reminders.inDays', { count: days });
}

export function Reminders() {
  const { t } = useI18n();
  const { version } = useData();
  const [list, setList] = useState<ReminderEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.reminders().then(r => setList(r.reminders)).catch(err => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load, version]);

  const header = <PageHeader title={t('reminders.title')} subtitle={t('reminders.subtitle')} />;
  if (error) return (<>{header}<ErrorState message={error} onRetry={load} /></>);
  if (!list) return (<div role="status" aria-label={t('common.loading')}>{header}<Skeleton className="h-32 w-full" /></div>);
  if (list.length === 0) return (<>{header}<EmptyState icon="bell" title={t('reminders.empty.title')} body={t('reminders.empty.body')} /></>);

  return (
    <div>
      {header}
      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
        {list.map(r => {
          const detail = r.kind === 'warranty_ending'
            ? t('reminders.warranty', { when: reminderWhen(t, r.days) })
            : r.kind === 'loan_overdue'
              ? t('reminders.overdue', { date: fmtDate(r.date), name: r.borrowerName ?? '' })
              : t('reminders.dueSoon', { when: reminderWhen(t, r.days), name: r.borrowerName ?? '' });
          return (
            <li key={`${r.kind}-${r.itemId}-${r.date}`}>
              <Link to={`/items/${r.itemId}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-hover">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control bg-sunken text-muted">
                  <Icon name={r.kind === 'warranty_ending' ? 'warranties' : 'borrowed'} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-medium text-ink">{r.itemName}</div>
                  <div className="truncate text-meta text-muted">{detail}</div>
                </div>
                {r.kind === 'loan_overdue' && <Badge tone="danger">{t('borrowed.overdue')}</Badge>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
