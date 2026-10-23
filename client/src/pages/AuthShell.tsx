import type { ReactNode } from 'react';
import { Logo } from '../components/ui/Logo';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { LANGUAGES } from '../types';

/** Shared frame for the sign-in, registration and recovery screens so they feel like the same product. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const { t, lang, setLanguage } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10 text-ink">
      <div className="w-full max-w-sm">
        <div role="group" aria-label={t('auth.language.label')} className="mb-4 flex justify-end gap-1 text-meta">
          {LANGUAGES.map(code => (
            <button
              key={code}
              type="button"
              lang={code}
              aria-pressed={lang === code}
              onClick={() => setLanguage(code)}
              className={`rounded-chip px-2 py-1 font-medium uppercase transition ${lang === code ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'}`}
            >
              {code}
            </button>
          ))}
        </div>
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="[&_span]:text-xl [&_img]:h-7 [&_img]:w-7" />
          <p className="mt-2 text-meta text-muted">{t('common.tagline')}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-6 md:p-7">
          <h1 className="text-title text-ink">{title}</h1>
          <p className="mb-6 mt-1 text-meta text-muted">{subtitle}</p>
          {children}
        </div>
        {footer && <p className="mt-5 text-center text-meta text-muted">{footer}</p>}
        <p className="mt-4 text-center text-caption text-muted">
          <Link to="/privacy" className="hover:underline">{t('privacy.link')}</Link>
          {' · '}
          <Link to="/terms" className="hover:underline">{t('terms.link')}</Link>
        </p>
      </div>
    </div>
  );
}
