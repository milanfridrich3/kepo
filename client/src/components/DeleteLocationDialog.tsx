import { useState } from 'react';
import type { Location } from '../types';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Field, FormError, Select } from './ui/Field';
import { pathStr, sortedByPath } from '../lib/format';
import { useI18n } from '../context/I18nContext';

/**
 * Confirms deleting a location without losing anything: its items must be
 * sent to another place (or to "no location"), and any places nested inside
 * it move up one level. `destination` is a location id, or 'none'.
 */
export function DeleteLocationDialog({
  location,
  locations,
  itemCount,
  childCount,
  onConfirm,
  onClose,
}: {
  location: Location;
  locations: Location[];
  /** Items directly inside this place (not in its sub-places). */
  itemCount: number;
  childCount: number;
  onConfirm: (destination: number | 'none' | undefined) => Promise<void>;
  onClose: () => void;
}) {
  const { t, rich } = useI18n();
  const [destination, setDestination] = useState<string>(location.parentId !== null ? String(location.parentId) : 'none');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices = sortedByPath(locations).filter(l => l.id !== location.id);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(itemCount > 0 ? (destination === 'none' ? 'none' : Number(destination)) : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('locations.delete.failed'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('locations.delete.title')} onClose={onClose} size="sm">
      {error && <FormError message={error} />}
      <p className="break-words text-body text-muted">
        {rich('locations.delete.body', { name: location.name }, { b: text => <span className="font-medium text-ink">{text}</span> })}
        {childCount > 0 &&
          ` ${
            location.parentId !== null
              ? t('locations.delete.childrenToParent', { count: childCount, parent: pathStr(location.parentId, locations) })
              : t('locations.delete.childrenToTop', { count: childCount })
          }`}
      </p>

      {itemCount > 0 && (
        <Field label={t('locations.delete.moveItems', { count: itemCount })} className="mb-0 mt-4">
          <Select value={destination} onChange={e => setDestination(e.target.value)}>
            <option value="none">{t('common.noLocation')}</option>
            {choices.map(l => (
              <option key={l.id} value={l.id}>
                {pathStr(l.id, locations)}
              </option>
            ))}
          </Select>
        </Field>
      )}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('locations.delete.keep')}</Button>
        <Button variant="danger" loading={busy} onClick={submit}>
          {t('locations.delete.confirm')}
        </Button>
      </div>
    </Dialog>
  );
}
