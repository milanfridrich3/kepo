import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../context/I18nContext';

/** Surface primitive: white/charcoal surface + subtle border. Elevation is reserved for overlays. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-surface ${className}`}>{children}</div>;
}

/** Card with a title row (and optional "view all" link) followed by content. */
export function Section({
  title,
  count,
  to,
  linkLabel,
  children,
}: {
  title: string;
  count?: number;
  to?: string;
  linkLabel?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
        <h2 className="text-body font-semibold text-ink">
          {title}
          {count !== undefined && <span className="ml-2 font-normal text-muted">{count}</span>}
        </h2>
        {to && (
          <Link to={to} className="rounded-chip px-1 text-meta font-medium text-accent-ink hover:underline">
            {linkLabel ?? t('ui.viewAll')}
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-title text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-meta text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Initials avatar, or the user's photo when `src` is given and loads successfully. */
export function Avatar({ name, src, className = 'h-9 w-9' }: { name: string; src?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || '?';

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        crossOrigin="use-credentials"
        onError={() => setFailed(true)}
        className={`inline-block shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft text-meta font-semibold text-accent-ink ${className}`}
    >
      {initial}
    </span>
  );
}
