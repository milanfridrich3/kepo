import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Icon } from './Icon';

// Shared look for every text-like control. Height is added per control so
// textareas can size to their content.
export const controlClass =
  'w-full rounded-control border border-line bg-surface px-3 text-body text-ink placeholder:text-faint transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/20';

type InvalidProp = { invalid?: boolean };

export function Input({ invalid, className = '', ...rest }: InputHTMLAttributes<HTMLInputElement> & InvalidProp) {
  return <input aria-invalid={invalid || undefined} className={`${controlClass} h-11 md:h-10 ${className}`} {...rest} />;
}

export function Textarea({ invalid, className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={`${controlClass} min-h-[5.5rem] resize-y py-2.5 ${className}`}
      {...rest}
    />
  );
}

export function Select({
  invalid,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & InvalidProp) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={`${controlClass} h-11 appearance-none pr-9 md:h-10 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
    </div>
  );
}

/** Label + control + hint/error. The label wraps the control, so it is programmatically associated. */
export function Field({
  label,
  children,
  hint,
  error,
  required,
  className = 'mb-4',
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-center gap-1 text-meta font-medium text-ink">
        {label}
        {required && (
          <span className="text-faint" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {children}
      {hint && !error && <span className="mt-1.5 block text-caption text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="mt-1.5 flex items-center gap-1.5 text-caption font-medium text-danger">
          <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      )}
    </label>
  );
}

/** Inline banner for form-level / request errors. */
export function FormError({ message }: { message: string }) {
  return (
    <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-control bg-danger-soft px-3 py-2.5 text-meta text-danger">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
