import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'icon';

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-control font-medium transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-hover active:bg-hover',
  ghost: 'text-muted hover:bg-hover hover:text-ink active:bg-hover',
  danger: 'border border-line bg-surface text-danger hover:bg-danger-soft active:bg-danger-soft',
};

// 44px touch targets on mobile, denser on pointer devices.
const SIZES: Record<ButtonSize, string> = {
  md: 'h-11 px-4 text-body md:h-10',
  sm: 'h-10 px-3 text-meta md:h-8',
  icon: 'h-11 w-11 md:h-9 md:w-9',
};

/** Class string for anything that should look like a button (e.g. a router <Link>). */
export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim();
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={`motion-safe:animate-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
