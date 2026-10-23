import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { Item, Location } from '../types';
import { ItemListRow, ListCard } from '../components/ItemViews';
import { EmptyState, ErrorState, LoadingList } from '../components/ui/States';
import { useI18n } from '../context/I18nContext';

export function SearchResults() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const [items, setItems] = useState<Item[] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // `cancelled` drops a slow response for an older query once a newer one exists.
    let cancelled = false;
    setItems(null);
    setError(null);
    api.search(q)
      .then(r => { if (!cancelled) setItems(r.items); })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [q]);

  useEffect(() => {
    api.locations().then(r => setLocations(r.locations)).catch(() => {});
  }, []);

  return (
    <div>
      <h1 className="mb-5 break-words text-title text-ink">
        {items ? t('search.results', { count: items.length, q }) : t('search.searching', { q })}
      </h1>
      {error && <ErrorState message={error} />}
      {!error && !items && <LoadingList />}
      {!error && items && items.length === 0 && (
        <EmptyState icon="search" title={t('search.empty.title')} body={t('search.empty.body')} />
      )}
      {!error && items && items.length > 0 && (
        <ListCard>
          {items.map(item => (
            <ItemListRow key={item.id} item={item} locations={locations} />
          ))}
        </ListCard>
      )}
    </div>
  );
}
