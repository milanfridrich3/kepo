import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { PageHeader } from '../components/ui/Card';
import { Icon } from '../components/ui/Icon';
import type { IconName } from '../components/ui/Icon';
import type { TranslationKey } from '../i18n';

const TOOLS: { to: string; icon: IconName; title: TranslationKey; body: TranslationKey }[] = [
  { to: '/insights', icon: 'chart', title: 'tools.insights', body: 'tools.insights.body' },
  { to: '/reminders', icon: 'bell', title: 'tools.reminders', body: 'tools.reminders.body' },
  { to: '/household', icon: 'users', title: 'tools.household', body: 'tools.household.body' },
  { to: '/labels', icon: 'printer', title: 'tools.labels', body: 'tools.labels.body' },
  { to: '/scan', icon: 'qr', title: 'tools.scan', body: 'tools.scan.body' },
];

export function Tools() {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={t('tools.title')} subtitle={t('tools.subtitle')} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {TOOLS.map(tool => (
          <li key={tool.to}>
            <Link to={tool.to} className="flex h-full items-start gap-3 rounded-card border border-line bg-surface p-4 transition hover:bg-hover">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
                <Icon name={tool.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-body font-semibold text-ink">{t(tool.title)}</span>
                <span className="mt-0.5 block text-meta text-muted">{t(tool.body)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
