import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Button } from './Button';
import { useI18n } from '../../context/I18nContext';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-control bg-sunken motion-safe:animate-pulse ${className}`} />;
}

/** Loading placeholder shaped like a list of rows. */
export function LoadingList({ rows = 4 }: { rows?: number }) {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('ui.loading')} className="overflow-hidden rounded-card border border-line bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-4 py-3.5 last:border-b-0">
          <Skeleton className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingBlock() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('ui.loading')} className="space-y-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-14 text-center">
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-card bg-accent-soft text-accent-ink">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <h2 className="text-heading text-ink">{title}</h2>
      {body && <p className="mt-1 max-w-sm text-body text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="flex flex-col items-center rounded-card border border-line bg-surface px-6 py-12 text-center">
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-card bg-danger-soft text-danger">
        <Icon name="alert" className="h-5 w-5" />
      </span>
      <h2 className="text-heading text-ink">{t('ui.error.title')}</h2>
      <p className="mt-1 max-w-sm text-body text-muted">{message}</p>
      {onRetry && (
        <Button className="mt-5" onClick={onRetry}>
          {t('ui.error.retry')}
        </Button>
      )}
    </div>
  );
}
