import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Borrowing } from '../types';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { Badge } from '../components/ui/Badge';
import { Avatar, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, LoadingList } from '../components/ui/States';
import { useI18n } from '../context/I18nContext';
import { dueLabel, daysUntil, fmtShort } from '../lib/format';

export function Borrowed() {
  const { t } = useI18n();
  const { version, bump } = useData();
  const toast = useToast();
  const [borrowings, setBorrowings] = useState<Borrowing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<number | null>(null);

  const load = useCallback(() => {
    setError(null);
    api.borrowings().then(r => setBorrowings(r.borrowings)).catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const markReturned = async (b: Borrowing) => {
    setReturningId(b.itemId);
    try {
      await api.returnItem(b.itemId);
      toast.success(t('borrowed.returned', { name: b.itemName }));
      bump(); // every mounted screen (this one included) refetches on the shared version
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('borrowed.returnFailed'));
    } finally {
      setReturningId(null);
    }
  };

  if (error) {
    return (
      <>
        <PageHeader title={t('borrowed.title')} subtitle={t('borrowed.subtitle')} />
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }
  if (!borrowings) {
    return (
      <div>
        <PageHeader title={t('borrowed.title')} subtitle={t('borrowed.subtitle')} />
        <LoadingList />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('borrowed.title')} subtitle={t('borrowed.subtitle')} />

      {borrowings.length === 0 ? (
        <EmptyState icon="borrowed" title={t('borrowed.empty.title')} body={t('borrowed.empty.body')} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {borrowings.map(b => {
            const overdue = b.expectedReturnDate ? (daysUntil(b.expectedReturnDate) ?? 0) < 0 : false;
            return (
              <div key={b.id} className="flex flex-col rounded-card border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={b.borrowerName} />
                  <div className="min-w-0 flex-1">
                    <Link to={`/items/${b.itemId}`} className="block truncate text-body font-medium text-ink hover:underline">
                      {b.itemName}
                    </Link>
                    <p className="truncate text-meta text-muted">{t('borrowed.with', { name: b.borrowerName })}</p>
                  </div>
                  {overdue && <Badge tone="warning">{t('borrowed.overdue')}</Badge>}
                </div>
                <p className="mt-3 text-meta text-muted">
                  {t('borrowed.lent', { date: fmtShort(b.lentDate) })}
                  {b.expectedReturnDate && (
                    <>
                      {' · '}
                      <span className={overdue ? 'font-medium text-warning' : ''}>{dueLabel(b.expectedReturnDate)}</span>
                    </>
                  )}
                </p>
                <Button size="sm" loading={returningId === b.itemId} onClick={() => markReturned(b)} className="mt-3">
                  <Icon name="check" className="h-4 w-4" />
                  {t('borrowed.markReturned')}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
