import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Location } from '../types';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Field, FormError, Input, Select } from './ui/Field';
import { pathStr, sortedByPath } from '../lib/format';
import { useI18n } from '../context/I18nContext';

/** Ids of `rootId` and everything nested under it — none of these may become its new parent. */
function selfAndDescendants(rootId: number, locations: Location[]): Set<number> {
  const ids = new Set<number>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of locations) {
      if (l.parentId !== null && ids.has(l.parentId) && !ids.has(l.id)) {
        ids.add(l.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Create a location, or (with `location`) rename it / move it somewhere else. */
export function LocationForm({
  location,
  locations,
  onSave,
  onClose,
}: {
  location?: Location;
  locations: Location[];
  onSave: (name: string, parentId: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(location?.name ?? '');
  const [parentId, setParentId] = useState(
    location?.parentId != null ? String(location.parentId) : ''
  );
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(() => {
    const blocked = location ? selfAndDescendants(location.id, locations) : new Set<number>();
    return sortedByPath(locations).filter(l => !blocked.has(l.id));
  }, [location, locations]);

  const nameError = attempted && !name.trim() ? t('locations.form.nameRequired') : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), parentId ? Number(parentId) : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('locations.form.saveFailed'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={location ? t('locations.form.titleEdit') : t('locations.form.titleNew')} onClose={onClose} size="sm">
      <form onSubmit={submit} noValidate>
        {error && <FormError message={error} />}
        <Field label={t('locations.form.name')} required error={nameError}>
          <Input
            autoFocus
            value={name}
            invalid={Boolean(nameError)}
            onChange={e => setName(e.target.value)}
            placeholder={t('locations.form.namePlaceholder')}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field label={t('locations.form.inside')} hint={t('locations.form.insideHint')}>
          <Select value={parentId} onChange={e => setParentId(e.target.value)}>
            <option value="">{t('locations.form.topLevel')}</option>
            {options.map(l => (
              <option key={l.id} value={l.id}>
                {pathStr(l.id, locations)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {location ? t('locations.form.submitEdit') : t('locations.form.submitNew')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
