import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { useI18n } from '../../context/I18nContext';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * One overlay primitive for every modal in the product.
 * - Mobile (< md): bottom sheet with a drag-handle affordance, safe-area aware.
 * - Tablet/desktop: centred modal.
 * Handles Escape, scroll lock, focus trap and focus restoration.
 */
export function Dialog({
  title,
  onClose,
  children,
  size = 'md',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Captured during render, i.e. before any autoFocus inside the dialog runs.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [opener]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    const panel = panelRef.current;
    if (event.key !== 'Tab' || !panel) return;
    const nodes = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) {
      event.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`relative flex max-h-[92dvh] w-full animate-sheet-up flex-col rounded-t-modal bg-surface pb-[env(safe-area-inset-bottom)] shadow-overlay outline-none md:max-h-[85vh] md:animate-pop-in md:rounded-modal md:pb-0 ${
          size === 'sm' ? 'md:max-w-md' : 'md:max-w-xl'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line-strong md:hidden" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-5">
          <h2 id={titleId} className="min-w-0 break-words text-heading text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('ui.dialog.close')}
            className="-mr-2 inline-flex h-10 w-10 items-center justify-center rounded-control text-muted transition hover:bg-hover hover:text-ink md:h-8 md:w-8"
          >
            <Icon name="x" className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>
  );
}
