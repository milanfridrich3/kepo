import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Location, Item } from '../types';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../context/I18nContext';
import { Card, PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { LocationForm } from '../components/LocationForm';
import { DeleteLocationDialog } from '../components/DeleteLocationDialog';

interface RowActions {
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
}

/** Edit / delete controls for one place. Sized for touch (40px) and labelled for screen readers. */
function RowButtons({ location, actions }: { location: Location; actions: RowActions }) {
  const { t } = useI18n();
  const base =
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted transition hover:bg-hover hover:text-ink md:h-8 md:w-8';
  return (
    <div className="flex shrink-0 items-center pr-2">
      <button type="button" aria-label={t('locations.row.edit', { name: location.name })} title={t('common.edit')} onClick={() => actions.onEdit(location)} className={base}>
        <Icon name="edit" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label={t('locations.row.delete', { name: location.name })}
        title={t('common.delete')}
        onClick={() => actions.onDelete(location)}
        className={`${base} hover:text-danger`}
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </div>
  );
}

function ChildRows({
  parentId,
  depth,
  childrenOf,
  totalFor,
  actions,
}: {
  parentId: number;
  depth: number;
  childrenOf: Map<number | null, Location[]>;
  totalFor: (id: number) => number;
  actions: RowActions;
}) {
  const { t } = useI18n();
  const kids = childrenOf.get(parentId) ?? [];
  return (
    <>
      {kids.map(kid => (
        <div key={kid.id}>
          <div className="flex items-center transition hover:bg-hover">
            <Link
              to={`/stuff?locationId=${kid.id}`}
              style={{ paddingLeft: `${1 + Math.min(depth, 6) * 1.25}rem` }}
              className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-2"
            >
              <Icon name={depth > 0 ? 'chevronRight' : 'locations'} className="h-4 w-4 shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{kid.name}</span>
              <span className="shrink-0 text-meta text-muted">{t('locations.itemCount', { count: totalFor(kid.id) })}</span>
            </Link>
            <RowButtons location={kid} actions={actions} />
          </div>
          <ChildRows parentId={kid.id} depth={depth + 1} childrenOf={childrenOf} totalFor={totalFor} actions={actions} />
        </div>
      ))}
    </>
  );
}

export function Locations() {
  const { version, bump } = useData();
  const toast = useToast();
  const { t } = useI18n();
  const [locations, setLocations] = useState<Location[] | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);

  const load = useCallback(() => {
    setError(null);
    Promise.all([api.locations(), api.items()])
      .then(([l, i]) => {
        setLocations(l.locations);
        setItems(i.items);
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load, version]);

  const { childrenOf, totalFor } = useMemo(() => {
    const children = new Map<number | null, Location[]>();
    for (const loc of locations ?? []) {
      const list = children.get(loc.parentId) ?? [];
      list.push(loc);
      children.set(loc.parentId, list);
    }
    const direct = new Map<number, number>();
    for (const item of items) {
      if (item.locationId !== null) direct.set(item.locationId, (direct.get(item.locationId) ?? 0) + 1);
    }
    // Total per place = items directly in it plus everything in the places nested under it.
    const cache = new Map<number, number>();
    const total = (id: number): number => {
      const cached = cache.get(id);
      if (cached !== undefined) return cached;
      const sum = (direct.get(id) ?? 0) + (children.get(id) ?? []).reduce((acc, child) => acc + total(child.id), 0);
      cache.set(id, sum);
      return sum;
    };
    return { childrenOf: children, totalFor: total };
  }, [locations, items]);

  const addButton = (
    <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
      <Icon name="plus" className="h-4 w-4" />
      {t('locations.new')}
    </Button>
  );

  if (error) {
    return (
      <>
        <PageHeader title={t('locations.title')} />
        <ErrorState message={error} onRetry={load} />
      </>
    );
  }
  if (!locations) {
    return (
      <div role="status" aria-label={t('common.loading')} className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const roots = childrenOf.get(null) ?? [];
  const actions: RowActions = { onEdit: setEditing, onDelete: setDeleting };

  return (
    <div>
      <PageHeader title={t('locations.title')} subtitle={t('locations.subtitle')} actions={locations.length > 0 ? addButton : undefined} />

      {roots.length === 0 ? (
        <EmptyState
          icon="locations"
          title={t('locations.empty.title')}
          body={t('locations.empty.body')}
          action={
            <Button variant="primary" onClick={() => setShowAdd(true)}>
              {t('locations.empty.create')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {roots.map(root => (
            <Card key={root.id} className="overflow-hidden">
              <div className="flex items-center border-b border-line transition hover:bg-hover">
                <Link to={`/stuff?locationId=${root.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
                    <Icon name="home" className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-heading text-ink">{root.name}</span>
                    <span className="block text-meta text-muted">{t('locations.itemCount', { count: totalFor(root.id) })}</span>
                  </span>
                </Link>
                <RowButtons location={root} actions={actions} />
              </div>
              <div className="divide-y divide-line">
                <ChildRows parentId={root.id} depth={0} childrenOf={childrenOf} totalFor={totalFor} actions={actions} />
              </div>
              {(childrenOf.get(root.id) ?? []).length === 0 && (
                <p className="px-4 py-3 text-meta text-muted">{t('locations.noChildren')}</p>
              )}
            </Card>
          ))}
        </div>
      )}

      {showAdd && (
        <LocationForm
          locations={locations}
          onClose={() => setShowAdd(false)}
          onSave={async (name, parentId) => {
            await api.createLocation({ name, parentId });
            setShowAdd(false);
            toast.success(t('locations.toast.created', { name }));
            bump();
          }}
        />
      )}

      {editing && (
        <LocationForm
          location={editing}
          locations={locations}
          onClose={() => setEditing(null)}
          onSave={async (name, parentId) => {
            await api.updateLocation(editing.id, { name, parentId });
            setEditing(null);
            toast.success(t('locations.toast.saved', { name }));
            bump();
          }}
        />
      )}

      {deleting && (
        <DeleteLocationDialog
          location={deleting}
          locations={locations}
          itemCount={items.filter(i => i.locationId === deleting.id).length}
          childCount={(childrenOf.get(deleting.id) ?? []).length}
          onClose={() => setDeleting(null)}
          onConfirm={async destination => {
            try {
              await api.deleteLocation(deleting.id, destination);
            } catch (err) {
              // Someone (another tab) added items since this screen loaded: refresh so the dialog shows the real count.
              if (err instanceof ApiError && err.status === 409) bump();
              throw err;
            }
            setDeleting(null);
            toast.success(t('locations.toast.deleted', { name: deleting.name }));
            bump();
          }}
        />
      )}
    </div>
  );
}
