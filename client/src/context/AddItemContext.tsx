import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { Category, ItemInput, Location } from '../types';
import { applyImageAction } from '../lib/itemImage';
import type { ImageAction } from '../lib/itemImage';
import { ItemForm } from '../components/ItemForm';
import { Dialog } from '../components/ui/Dialog';
import { ErrorState, LoadingBlock } from '../components/ui/States';
import { useData } from './DataContext';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';

/**
 * "Add item" is reachable from anywhere (top bar, mobile action button,
 * empty states), so the form lives once here. It fetches categories and
 * locations from the API each time it opens, creates the item through the
 * existing endpoint, then signals `bump()` so the visible screen refreshes.
 */
interface AddItemContextValue {
  openAddItem: () => void;
}

const AddItemContext = createContext<AddItemContextValue | undefined>(undefined);

export function AddItemProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const { bump } = useData();
  const [open, setOpen] = useState(false);
  const [refs, setRefs] = useState<{ categories: Category[]; locations: Location[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    setRefs(null);
    setLoadError(null);
    Promise.all([api.categories(), api.locations()])
      .then(([c, l]) => setRefs({ categories: c.categories, locations: l.locations }))
      .catch(err => setLoadError(err.message));
  }, []);

  const openAddItem = useCallback(() => {
    setOpen(true);
    load();
  }, [load]);

  const close = useCallback(() => setOpen(false), []);

  const create = async (data: ItemInput, image: ImageAction) => {
    const { item } = await api.createItem(data);
    // The item exists from here on, so the form closes whatever happens to
    // the photo (re-submitting would create a second item).
    const imageError = await applyImageAction(item.id, image);
    setOpen(false);
    toast.success(t('itemForm.added', { name: item.name }), { label: t('itemForm.added.view'), onClick: () => navigate(`/items/${item.id}`) });
    if (imageError) toast.error(t('itemForm.added.photoError', { name: item.name, error: imageError }));
    bump();
  };

  const value = useMemo(() => ({ openAddItem }), [openAddItem]);

  return (
    <AddItemContext.Provider value={value}>
      {children}
      {open &&
        (refs ? (
          <ItemForm categories={refs.categories} locations={refs.locations} onSave={create} onClose={close} />
        ) : (
          <Dialog title={t('itemForm.title.add')} onClose={close}>
            {loadError ? <ErrorState message={loadError} onRetry={load} /> : <LoadingBlock />}
          </Dialog>
        ))}
    </AddItemContext.Provider>
  );
}

export function useAddItem() {
  const ctx = useContext(AddItemContext);
  if (!ctx) throw new Error('useAddItem must be used within AddItemProvider');
  return ctx;
}
