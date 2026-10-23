import { Link } from 'react-router-dom';
import { useI18n } from '../../context/I18nContext';
import { Logo } from '../../components/ui/Logo';
import { LANGUAGES } from '../../types';
import type { TranslationKey } from '../../i18n';

export interface LegalSection { title: TranslationKey; body: TranslationKey }

/** Shared layout for the public privacy notice and terms: language switch, operator line, sections, cross-links. */
export function LegalPage({ title, sections, other }: { title: TranslationKey; sections: LegalSection[]; other: { to: string; label: TranslationKey } }) {
  const { t, lang, setLanguage } = useI18n();
  return (
    <div className="min-h-screen bg-canvas px-4 py-10 text-ink">
      <article className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link to="/" aria-label={t('layout.home')}><Logo /></Link>
          <div role="group" aria-label={t('auth.language.label')} className="flex gap-1 text-meta">
            {LANGUAGES.map(code => (
              <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLanguage(code)}
                className={`rounded-chip px-2 py-1 font-medium uppercase ${lang === code ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'}`}>
                {code}
              </button>
            ))}
          </div>
        </div>
        <h1 className="text-title">{t(title)}</h1>
        <p className="mt-1 text-meta text-muted">{t('legal.updated')}</p>

        <section className="mt-6">
          <h2 className="text-body font-semibold">{t('legal.operator.title')}</h2>
          <p className="mt-1 text-body text-muted">{t('legal.operator.body')}</p>
        </section>

        {sections.map(s => (
          <section key={s.title} className="mt-6">
            <h2 className="text-body font-semibold">{t(s.title)}</h2>
            <p className="mt-1 whitespace-pre-line text-body text-muted">{t(s.body)}</p>
          </section>
        ))}
        <p className="mt-8 flex flex-wrap gap-x-4 text-meta">
          <Link to="/" className="font-medium text-accent-ink hover:underline">{t('legal.back')}</Link>
          <Link to={other.to} className="font-medium text-accent-ink hover:underline">{t(other.label)}</Link>
        </p>
      </article>
    </div>
  );
}
