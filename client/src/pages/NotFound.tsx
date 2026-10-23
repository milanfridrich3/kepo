import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/States';
import { buttonClass } from '../components/ui/Button';
import { useI18n } from '../context/I18nContext';

export function NotFound() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon="search"
      title={t('notFound.title')}
      body={t('notFound.body')}
      action={
        <Link to="/" className={buttonClass('primary')}>
          {t('notFound.back')}
        </Link>
      }
    />
  );
}
