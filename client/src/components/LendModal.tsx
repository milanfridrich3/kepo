import { useState } from 'react';
import type { FormEvent } from 'react';
import type { BorrowerInfo, Item } from '../types';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Field, FormError, Input } from './ui/Field';
import { useI18n } from '../context/I18nContext';

/** Lend an item, or (with `existing`) edit the details of its current loan. */
export function LendModal({
  item,
  existing,
  onSave,
  onClose,
}: {
  item: Item;
  existing?: BorrowerInfo;
  onSave: (borrowerName: string, expectedReturnDate: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [borrower, setBorrower] = useState(existing?.borrowerName ?? '');
  const [returnDate, setReturnDate] = useState(existing?.expectedReturnDate ?? '');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borrowerError = attempted && !borrower.trim() ? t('lend.borrower.error') : undefined;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!borrower.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(borrower.trim(), returnDate || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('lend.error'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={existing ? t('lend.title.edit', { name: item.name }) : t('lend.title.lend', { name: item.name })} onClose={onClose} size="sm">
      <form onSubmit={submit} noValidate>
        {error && <FormError message={error} />}
        <Field label={t('lend.borrower')} required error={borrowerError}>
          <Input
            autoFocus
            value={borrower}
            invalid={Boolean(borrowerError)}
            onChange={e => setBorrower(e.target.value)}
            placeholder={t('lend.borrower.placeholder')}
            autoComplete="off"
            maxLength={120}
          />
        </Field>
        <Field label={t('lend.expected')} hint={t('lend.expected.hint')}>
          <Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
        </Field>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {existing ? t('lend.save') : t('lend.submit')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
