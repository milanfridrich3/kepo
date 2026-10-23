import type { ReactNode } from 'react';
import type { ItemStatus } from '../../types';
import { statusLabel } from '../../lib/format';
import { useI18n } from '../../context/I18nContext';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-muted',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** Status is always communicated with a text label, never colour alone. */
export function Badge({ tone = 'neutral', dot = false, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip px-2 py-0.5 text-caption font-medium ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ItemStatus, BadgeTone> = {
  with_me: 'success',
  stored: 'neutral',
  borrowed: 'accent',
  lost: 'danger',
  sold: 'neutral',
  disposed: 'neutral',
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  useI18n(); // re-render when the language changes
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {statusLabel(status)}
    </Badge>
  );
}
