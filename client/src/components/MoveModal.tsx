import { useState } from 'react';
import type { Item, Location } from '../types';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Field, FormError, Select } from './ui/Field';
import { pathStr, sortedByPath } from '../lib/format';
import { useI18n } from '../context/I18nContext';

export function MoveModal({
  item,
  locations,
  onSave,
  onClose,
}: {
  item: Item;
  locations: Location[];
  onSave: (locationId: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [locationId, setLocationId] = useState<string>(item.locationId ? String(item.locationId) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(locationId ? Number(locationId) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('move.error'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={t('move.title', { name: item.name })} onClose={onClose} size="sm">
      {error && <FormError message={error} />}
      <p className="mb-4 text-meta text-muted">{t('move.current', { place: pathStr(item.locationId, locations) })}</p>
      <Field label={t('move.new')}>
        <Select value={locationId} onChange={e => setLocationId(e.target.value)} autoFocus>
          <option value="">{t('common.noLocation')}</option>
          {sortedByPath(locations).map(l => (
            <option key={l.id} value={l.id}>
              {pathStr(l.id, locations)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" loading={busy} onClick={submit}>
          {t('move.submit')}
        </Button>
      </div>
    </Dialog>
  );
}
