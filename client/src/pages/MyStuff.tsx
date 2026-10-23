import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Item, Category, Location, ItemStatus, ItemFilterQuery, SavedSearch } from '../types';
import { STATUSES } from '../types';
import { useData } from '../context/DataContext';
import { useAddItem } from '../context/AddItemContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { categoryLabel, pathStr, sortedByPath, statusLabel } from '../lib/format';
import { advancedFilterCount, filterToApiParams, filterToParams, isFilterEmpty, paramsToFilter } from '../lib/filterParams';
import { parseTagInput } from '../lib/tags';
import { ItemCard, ItemListRow, ListCard } from '../components/ItemViews';
import { ItemFilterPanel } from '../components/ItemFilterPanel';
import { PageHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Chip, SegmentedControl } from '../components/ui/Controls';
import { Dialog } from '../components/ui/Dialog';
import { Field, FormError, Input, Select } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { EmptyState, ErrorState, LoadingList } from '../components/ui/States';

type ViewMode = 'list' | 'grid';
const VIEW_KEY = 'kepo-items-view';
const MAX_BULK = 100;

function readView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}

type BulkDialog = 'move' | 'tags' | 'remove' | 'purge' | 'save' | null;

export function MyStuff() {
  const [params, setParams] = useSearchParams();
  const filter = useMemo(() => paramsToFilter(params), [params]);
  const { version, bump } = useData();
  const { openAddItem } = useAddItem();
  const { t } = useI18n();
  const toast = useToast();

  const [items, setItems] = useState<Item[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [tagList, setTagList] = useState<{ tag: string; count: number }[]>([]);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(readView);
  const [showFilters, setShowFilters] = useState(false);
  const [searchText, setSearchText] = useState(filter.search ?? '');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dialog, setDialog] = useState<BulkDialog>(null);
  const [busy, setBusy] = useState(false);
  const latestRequest = useRef(0);

  const setFilter = useCallback((next: ItemFilterQuery) => setParams(filterToParams(next), { replace: true }), [setParams]);
  const removedView = filter.archived === 'only';

  const changeView = (next: ViewMode) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* preference only */ }
  };

  // The search box is debounced into the address.
  useEffect(() => {
    if ((filter.search ?? '') === searchText.trim()) return;
    const timer = window.setTimeout(() => setFilter({ ...filter, search: searchText.trim() || undefined }), 350);
    return () => window.clearTimeout(timer);
  }, [searchText, filter, setFilter]);
  useEffect(() => { setSearchText(filter.search ?? ''); }, [filter.search]);

  const filterKey = filterToParams(filter).toString();
  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    setError(null);
    api.items(filterToApiParams(filter))
      .then(r => {
        if (requestId !== latestRequest.current) return;
        setItems(r.items);
        setSelected(prev => new Set([...prev].filter(id => r.items.some(i => i.id === id))));
      })
      .catch(err => {
        if (requestId !== latestRequest.current) return;
        setError(err.message);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => { load(); }, [load, version]);
  useEffect(() => {
    api.categories().then(r => setCategories(r.categories)).catch(() => {});
    api.locations().then(r => setLocations(r.locations)).catch(() => {});
    api.tags().then(r => setTagList(r.tags)).catch(() => {});
    api.savedSearches().then(r => setSaved(r.savedSearches)).catch(() => {});
  }, [version]);

  const locationName = useMemo(
    () => (filter.locationId ? locations.find(l => l.id === filter.locationId)?.name ?? t('items.thisPlace') : null),
    [filter.locationId, locations, t]
  );

  const advancedCount = advancedFilterCount(filter);
  const filtersActive = !isFilterEmpty(filter);
  const clearFilters = () => { setSearchText(''); setParams(new URLSearchParams(), { replace: true }); };

  const subtitle = items
    ? locationName
      ? t('items.subtitleIn', { count: items.length, place: locationName })
      : t('items.subtitle', { count: items.length })
    : undefined;

  const toggle = (id: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_BULK) next.add(id);
    else toast.error(t('items.bulk.limit', { max: MAX_BULK }));
    return next;
  });
  const stopSelecting = () => { setSelecting(false); setSelected(new Set()); };
  const selectedIds = [...selected];

  const finish = (message: string) => { toast.success(message); setDialog(null); setSelected(new Set()); bump(); };
  const failure = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('items.bulk.failed'));

  const doRemove = async () => {
    setBusy(true);
    try { const r = await api.bulkArchive(selectedIds); finish(t('items.bulk.removed', { count: r.archived })); }
    catch (err) { failure(err); } finally { setBusy(false); }
  };
  const doPurge = async () => {
    setBusy(true);
    try { const r = await api.purgeItems(selectedIds); finish(t('items.bulk.purged', { count: r.deleted })); }
    catch (err) { failure(err); } finally { setBusy(false); }
  };
  const doRestore = async () => {
    setBusy(true);
    let restored = 0;
    try { for (const id of selectedIds) { await api.restoreItem(id); restored++; } finish(t('items.bulk.restored', { count: restored })); }
    catch (err) { if (restored > 0) { setSelected(new Set()); bump(); } failure(err); } finally { setBusy(false); }
  };

  const savedSelect = (
    <Select aria-label={t('items.saved.label')} value="" onChange={e => {
      const s = saved.find(x => String(x.id) === e.target.value);
      if (s) { setSearchText(s.query.search ?? ''); setParams(filterToParams(s.query), { replace: true }); }
    }}>
      <option value="">{saved.length ? t('items.saved.choose') : t('items.saved.none')}</option>
      {saved.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </Select>
  );

  return (
    <div className={selecting ? 'pb-24' : ''}>
      <PageHeader
        title={removedView ? t('items.removedTitle') : t('items.title')}
        subtitle={subtitle}
        actions={
          items && items.length > 0 ? (
            <Button size="sm" onClick={() => (selecting ? stopSelecting() : setSelecting(true))}>
              {selecting ? t('items.select.done') : t('items.select.start')}
            </Button>
          ) : undefined
        }
      />

      <div className="mb-4 space-y-3">
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input
            type="search"
            aria-label={t('items.search.label')}
            placeholder={t('items.search.placeholder')}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            maxLength={100}
            className="pl-9"
          />
        </div>

        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" role="group" aria-label={t('items.filter.status')}>
          <Chip selected={!filter.status?.length} onClick={() => setFilter({ ...filter, status: undefined })}>
            {t('items.filter.all')}
          </Chip>
          {STATUSES.map(s => (
            <Chip key={s} selected={filter.status?.length === 1 && filter.status[0] === s} onClick={() => setFilter({ ...filter, status: [s as ItemStatus] })}>
              {statusLabel(s)}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-44 sm:w-52">
            <Select aria-label={t('items.filter.category')} value={filter.categoryId ? String(filter.categoryId) : 'all'}
              onChange={e => setFilter({ ...filter, categoryId: e.target.value === 'all' ? undefined : Number(e.target.value) })}>
              <option value="all">{t('items.filter.allCategories')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{categoryLabel(c.name)}</option>)}
            </Select>
          </div>
          <Button size="sm" aria-expanded={showFilters} onClick={() => setShowFilters(o => !o)}>
            <Icon name="filter" className="h-4 w-4" />
            {t('items.filters.button')}{advancedCount > 0 ? ` · ${advancedCount}` : ''}
          </Button>
          <div className="w-40 sm:w-48">{savedSelect}</div>
          {filtersActive && (
            <Button size="sm" variant="ghost" onClick={() => setDialog('save')}>{t('items.saved.save')}</Button>
          )}
          {filter.locationId && (
            <button
              type="button"
              onClick={() => setFilter({ ...filter, locationId: undefined, sub: undefined })}
              className="inline-flex h-10 items-center gap-1.5 rounded-control border border-accent/30 bg-accent-soft px-3 text-meta font-medium text-accent-ink md:h-8"
            >
              {t('items.filter.inPlace', { place: locationName ?? '' })}
              <Icon name="x" className="h-3.5 w-3.5" />
              <span className="sr-only">{t('items.filter.clearPlace')}</span>
            </button>
          )}
          <div className="ml-auto">
            <SegmentedControl<ViewMode>
              label={t('items.view.label')}
              iconOnly
              value={view}
              onChange={changeView}
              options={[
                { value: 'list', label: t('items.view.list'), icon: 'list' },
                { value: 'grid', label: t('items.view.grid'), icon: 'grid' },
              ]}
            />
          </div>
        </div>
      </div>

      {showFilters && <ItemFilterPanel filter={filter} onChange={setFilter} tags={tagList} />}

      {error && <ErrorState message={error} onRetry={load} />}
      {!error && !items && <LoadingList />}

      {!error && items && items.length === 0 && (
        filtersActive ? (
          <EmptyState
            icon="search"
            title={t('items.empty.filtered.title')}
            body={t('items.empty.filtered.body')}
            action={<Button onClick={clearFilters}>{t('items.empty.filtered.action')}</Button>}
          />
        ) : (
          <EmptyState
            icon="items"
            title={t('items.empty.none.title')}
            body={t('items.empty.none.body')}
            action={<Button variant="primary" onClick={openAddItem}>{t('items.empty.none.action')}</Button>}
          />
        )
      )}

      {!error && items && items.length > 0 &&
        (view === 'list' ? (
          <ListCard>
            {items.map(item => (
              <ItemListRow key={item.id} item={item} locations={locations}
                select={selecting ? { checked: selected.has(item.id), onToggle: () => toggle(item.id) } : undefined} />
            ))}
          </ListCard>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {items.map(item => (
              <ItemCard key={item.id} item={item} locations={locations}
                select={selecting ? { checked: selected.has(item.id), onToggle: () => toggle(item.id) } : undefined} />
            ))}
          </div>
        ))}

      {selecting && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t border-line bg-surface px-4 py-3 shadow-lg md:bottom-0 md:left-16 lg:left-60" role="toolbar" aria-label={t('items.bulk.toolbar')}>
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2">
            <span className="mr-auto text-body font-medium text-ink">{t('items.bulk.selected', { count: selected.size })}</span>
            {removedView ? (
              <>
                <Button size="sm" variant="danger" disabled={selected.size === 0 || busy} onClick={() => setDialog('purge')}>{t('items.bulk.purge')}</Button>
                <Button size="sm" variant="primary" disabled={selected.size === 0 || busy} loading={busy} onClick={() => void doRestore()}>{t('items.bulk.restore')}</Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={selected.size === 0} onClick={() => setDialog('move')}>{t('items.bulk.move')}</Button>
                <Button size="sm" disabled={selected.size === 0} onClick={() => setDialog('tags')}>{t('items.bulk.tags')}</Button>
                <Button size="sm" variant="danger" disabled={selected.size === 0} onClick={() => setDialog('remove')}>{t('items.bulk.remove')}</Button>
              </>
            )}
          </div>
        </div>
      )}

      {dialog === 'move' && <BulkMoveDialog locations={locations} count={selected.size} onClose={() => setDialog(null)}
        onSave={async locationId => { try { const r = await api.bulkMove(selectedIds, locationId); finish(t('items.bulk.moved', { count: r.moved })); } catch (err) { failure(err); } }} />}
      {dialog === 'tags' && <BulkTagsDialog items={(items ?? []).filter(i => selected.has(i.id))} count={selected.size} onClose={() => setDialog(null)}
        onSave={async (add, remove) => { try { const r = await api.bulkTags(selectedIds, add, remove); finish(t('items.bulk.tagged', { count: r.updated })); } catch (err) { failure(err); } }} />}
      {dialog === 'purge' && (
        <Dialog title={t('items.bulk.purge.title', { count: selected.size })} onClose={() => setDialog(null)} size="sm">
          <p className="text-body text-muted">{t('items.bulk.purge.body')}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={busy} onClick={() => void doPurge()}>{t('items.bulk.purge')}</Button>
          </div>
        </Dialog>
      )}
      {dialog === 'remove' && (
        <Dialog title={t('items.bulk.remove.title', { count: selected.size })} onClose={() => setDialog(null)} size="sm">
          <p className="text-body text-muted">{t('items.bulk.remove.body')}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setDialog(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={busy} onClick={() => void doRemove()}>{t('items.bulk.remove')}</Button>
          </div>
        </Dialog>
      )}
      {dialog === 'save' && <SaveFilterDialog onClose={() => setDialog(null)} onSave={async name => {
        const r = await api.createSavedSearch(name, filter);
        setSaved(prev => [...prev, r.savedSearch].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success(t('items.saved.saved'));
        setDialog(null);
      }} />}
      {saved.length > 0 && <SavedManage saved={saved} onDelete={async id => {
        try { await api.deleteSavedSearch(id); setSaved(prev => prev.filter(s => s.id !== id)); toast.success(t('items.saved.deleted')); }
        catch (err) { failure(err); }
      }} />}
    </div>
  );
}

function SavedManage({ saved, onDelete }: { saved: SavedSearch[]; onDelete: (id: number) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-6">
      <button type="button" className="text-meta font-medium text-accent-ink hover:underline" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {t('items.saved.manage', { count: saved.length })}
      </button>
      {open && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {saved.map(s => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="min-w-0 truncate text-body text-ink">{s.name}</span>
              <Button size="sm" variant="ghost" aria-label={t('items.saved.delete', { name: s.name })} onClick={() => onDelete(s.id)}>
                <Icon name="trash" className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SaveFilterDialog({ onClose, onSave }: { onClose: () => void; onSave: (name: string) => Promise<void> }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={t('items.saved.dialog')} onClose={onClose} size="sm">
      <form onSubmit={async e => {
        e.preventDefault();
        if (!name.trim()) { setError(t('items.saved.nameRequired')); return; }
        setBusy(true); setError(null);
        try { await onSave(name.trim()); } catch (err) { setError(err instanceof Error ? err.message : t('items.bulk.failed')); setBusy(false); }
      }}>
        {error && <FormError message={error} />}
        <Field label={t('items.saved.name')}>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="off" />
        </Field>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>{t('items.saved.save')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function BulkMoveDialog({ locations, count, onClose, onSave }: { locations: Location[]; count: number; onClose: () => void; onSave: (locationId: number | null) => Promise<void> }) {
  const { t } = useI18n();
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const ordered = sortedByPath(locations);
  return (
    <Dialog title={t('items.bulk.move.title', { count })} onClose={onClose} size="sm">
      <Field label={t('items.bulk.move.to')}>
        <Select value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">{t('common.noLocation')}</option>
          {ordered.map(l => <option key={l.id} value={l.id}>{pathStr(l.id, locations)}</option>)}
        </Select>
      </Field>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" loading={busy} onClick={async () => { setBusy(true); await onSave(target ? Number(target) : null); setBusy(false); }}>{t('items.bulk.move')}</Button>
      </div>
    </Dialog>
  );
}

function BulkTagsDialog({ items, count, onClose, onSave }: { items: Item[]; count: number; onClose: () => void; onSave: (add: string[], remove: string[]) => Promise<void> }) {
  const { t } = useI18n();
  const [addText, setAddText] = useState('');
  const [remove, setRemove] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const existing = useMemo(() => [...new Map(items.flatMap(i => i.tags).map(tag => [tag.toLowerCase(), tag])).values()].sort(), [items]);
  const add = parseTagInput(addText);
  return (
    <Dialog title={t('items.bulk.tags.title', { count })} onClose={onClose} size="sm">
      <Field label={t('items.bulk.tags.add')} hint={t('itemForm.tags.hint', { max: 10 })}>
        <Input autoFocus value={addText} onChange={e => setAddText(e.target.value)} placeholder={t('itemForm.tags.placeholder')} autoComplete="off" />
      </Field>
      {existing.length > 0 && (
        <div className="mb-2">
          <div className="mb-1.5 text-caption font-medium uppercase tracking-wide text-muted">{t('items.bulk.tags.remove')}</div>
          <div className="flex flex-wrap gap-2">
            {existing.map(tag => (
              <Chip key={tag} selected={remove.includes(tag)} onClick={() => setRemove(r => (r.includes(tag) ? r.filter(x => x !== tag) : [...r, tag]))}>{tag}</Chip>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" loading={busy} disabled={add.length === 0 && remove.length === 0}
          onClick={async () => { setBusy(true); await onSave(add, remove); setBusy(false); }}>{t('items.bulk.tags.apply')}</Button>
      </div>
    </Dialog>
  );
}
