import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Icon } from './ui/Icon';
import type { IconName } from './ui/Icon';
import { Logo, KepoMark } from './ui/Logo';
import { Button } from './ui/Button';
import { useAddItem } from '../context/AddItemContext';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import type { TranslationKey } from '../i18n';
import { firstName } from '../lib/format';
import { avatarUrl } from '../lib/avatar';
import { Avatar } from './ui/Card';

interface NavEntry {
  to: string;
  labelKey: TranslationKey;
  icon: IconName;
  end?: boolean;
  /** Other path prefixes that should light this entry up (e.g. item detail belongs to My Items). */
  also?: string[];
}

// The five primary destinations — identical on every screen size.
const NAV: NavEntry[] = [
  { to: '/', labelKey: 'layout.nav.dashboard', icon: 'dashboard', end: true },
  { to: '/stuff', labelKey: 'layout.nav.items', icon: 'items', also: ['/items'] },
  { to: '/borrowed', labelKey: 'layout.nav.borrowed', icon: 'borrowed' },
  { to: '/locations', labelKey: 'layout.nav.locations', icon: 'locations' },
  { to: '/warranties', labelKey: 'layout.nav.warranties', icon: 'warranties' },
];

function isActive(pathname: string, entry: NavEntry): boolean {
  if (entry.end) return pathname === entry.to;
  return [entry.to, ...(entry.also ?? [])].some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Desktop (lg): full sidebar. Tablet (md): compact icon rail, same items, labels
 * exposed via aria-label/title. Mobile: hidden — bottom navigation takes over.
 */
function Sidebar({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const settingsActive = pathname === '/settings';

  const linkClass = (active: boolean) =>
    `flex h-10 items-center gap-3 rounded-control px-2.5 text-body font-medium transition md:justify-center lg:justify-start ${
      active ? 'bg-accent-soft text-accent-ink' : 'text-muted hover:bg-hover hover:text-ink'
    }`;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-surface px-3 py-4 md:flex lg:w-60">
      <Link to="/" aria-label={t('layout.home')} className="mb-6 flex h-10 items-center rounded-control px-1.5 md:justify-center lg:justify-start">
        <span className="lg:hidden">
          <KepoMark className="h-7 w-7" />
        </span>
        <span className="hidden lg:inline-flex">
          <Logo />
        </span>
      </Link>

      <nav aria-label={t('layout.nav.primary')} className="flex flex-col gap-1">
        {NAV.map(entry => {
          const active = isActive(pathname, entry);
          return (
            <Link
              key={entry.to}
              to={entry.to}
              title={t(entry.labelKey)}
              aria-label={t(entry.labelKey)}
              aria-current={active ? 'page' : undefined}
              className={linkClass(active)}
            >
              <Icon name={entry.icon} className="h-[18px] w-[18px] shrink-0" />
              <span className="hidden lg:inline">{t(entry.labelKey)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-line pt-3">
        <Link
          to="/tools"
          title={t('layout.nav.tools')}
          aria-label={t('layout.nav.tools')}
          aria-current={pathname === '/tools' ? 'page' : undefined}
          className={`${linkClass(pathname === '/tools')} mb-1`}
        >
          <Icon name="grid" className="h-[18px] w-[18px] shrink-0" />
          <span className="hidden lg:inline">{t('layout.nav.tools')}</span>
        </Link>
        <Link
          to="/settings"
          title={t('layout.nav.settings')}
          aria-label={t('layout.nav.settings')}
          aria-current={settingsActive ? 'page' : undefined}
          className={linkClass(settingsActive)}
        >
          <Icon name="settings" className="h-[18px] w-[18px] shrink-0" />
          <span className="hidden lg:inline">{t('layout.nav.settings')}</span>
        </Link>
        {user && (
          <Link
            to="/settings"
            className="mt-2 flex items-center gap-2 rounded-control px-2 py-1.5 transition hover:bg-hover md:justify-center lg:justify-start"
            aria-label={t('layout.account', { name: user.name })}
          >
            <Avatar name={user.name} src={avatarUrl(user)} className="h-7 w-7" />
            <span className="hidden min-w-0 truncate text-caption text-muted lg:block">
              {firstName(user.name)} · {user.email}
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}

function MobileHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] md:hidden">
      <Link to="/" aria-label={t('layout.home')} className="rounded-control">
        <Logo />
      </Link>
      <div className="flex items-center">
        <Link
          to="/tools"
          aria-label={t('layout.nav.tools')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-control text-muted transition hover:bg-hover hover:text-ink"
        >
          <Icon name="grid" className="h-5 w-5" />
        </Link>
        <Link
          to="/settings"
          aria-label={t('layout.nav.settings')}
          className="inline-flex h-10 w-10 items-center justify-center rounded-control text-muted transition hover:bg-hover hover:text-ink"
        >
          <Icon name="settings" className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}

function BottomNav({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t('layout.nav.primary')}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map(entry => {
        const active = isActive(pathname, entry);
        return (
          <Link
            key={entry.to}
            to={entry.to}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition active:bg-hover ${
              active ? 'text-accent-ink' : 'text-muted'
            }`}
          >
            <span className={`inline-flex h-7 w-12 items-center justify-center rounded-control transition ${active ? 'bg-accent-soft' : ''}`}>
              <Icon name={entry.icon} className="h-5 w-5" />
            </span>
            {t(entry.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}

/** Global search: submit to search; while already on the results page it updates live. Press "/" to focus. */
function SearchBox() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const onResults = pathname === '/search';
  const [q, setQ] = useState(onResults ? params.get('q') ?? '' : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!onResults) setQ('');
    else if (document.activeElement !== inputRef.current) setQ(params.get('q') ?? '');
  }, [onResults, params]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = event.target as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);


  const go = (value: string, replace: boolean) => {
    const trimmed = value.trim();

    if (trimmed) {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`, { replace });
    } else if (onResults) {
      navigate('/search', { replace: true });
    }
  };

  const onChange = (value: string) => {
    setQ(value);
    window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      const trimmed = value.trim();

      if (trimmed) {
        navigate(`/search?q=${encodeURIComponent(trimmed)}`, {
          replace: true,
        });
      } else if (onResults) {
        navigate('/search', { replace: true });
      }
    }, 300);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    window.clearTimeout(timer.current);
    go(q, onResults);
  };


  return (
    <form role="search" onSubmit={onSubmit} className="relative min-w-0 flex-1 md:max-w-xl">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={e => onChange(e.target.value)}
        placeholder={t('layout.search.placeholder')}
        aria-label={t('layout.search.label')}
        autoComplete="off"
        enterKeyHint="search"
        className="h-11 w-full rounded-control border border-line bg-surface pl-9 pr-9 text-body text-ink transition placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 md:h-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {q ? (
        <button
          type="button"
          aria-label={t('layout.search.clear')}
          onClick={() => {
            setQ('');
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-chip text-muted hover:bg-hover hover:text-ink"
        >
          <Icon name="x" className="h-4 w-4" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-chip border border-line px-1.5 text-caption text-faint lg:inline">
          /
        </kbd>
      )}
    </form>
  );
}

const FAB_ROUTES = ['/', '/stuff', '/locations', '/borrowed'];

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { openAddItem } = useAddItem();

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-[70] rounded-control bg-accent px-3 py-2 text-body font-medium text-accent-fg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t('layout.skipToContent')}
      </a>
      <Sidebar pathname={pathname} />
      <MobileHeader />

      <div className="md:pl-16 lg:pl-60">
        <main
          id="main"
          className="mx-auto w-full max-w-5xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-12 md:pt-6"
        >
          <div className="mb-6 flex items-center gap-3">
            <SearchBox />
            <Button variant="primary" className="hidden md:inline-flex" onClick={openAddItem}>
              <Icon name="plus" className="h-4 w-4" />
              {t('layout.addItem')}
            </Button>
          </div>
          <div key={pathname} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {FAB_ROUTES.includes(pathname) && (
        <button
          type="button"
          onClick={openAddItem}
          aria-label={t('layout.addItem')}
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-20 inline-flex h-14 w-14 items-center justify-center rounded-card bg-accent text-accent-fg shadow-overlay transition active:scale-95 md:hidden"
        >
          <Icon name="plus" className="h-6 w-6" strokeWidth={2} />
        </button>
      )}

      <BottomNav pathname={pathname} />
    </div>
  );
}
