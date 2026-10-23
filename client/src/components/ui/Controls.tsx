import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/** Segmented switch for small mutually-exclusive choices (view mode, appearance). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  iconOnly = false,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; icon?: IconName }[];
  label: string;
  iconOnly?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-control bg-sunken p-0.5">
      {options.map(option => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-[0.5rem] px-3 text-meta font-medium transition md:h-8 ${
              selected ? 'bg-surface text-ink shadow-raised' : 'text-muted hover:text-ink'
            }`}
          >
            {option.icon && <Icon name={option.icon} className="h-4 w-4" />}
            {!iconOnly && option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Filter chip (toggle). Selected state is a tint + border, not colour alone: aria-pressed is exposed. */
export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 items-center rounded-control border px-3 text-meta font-medium transition active:scale-[0.98] md:h-8 ${
        selected
          ? 'border-accent/30 bg-accent-soft text-accent-ink'
          : 'border-line bg-surface text-muted hover:bg-hover hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
