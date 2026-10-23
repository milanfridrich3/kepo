import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Currency, Item, ItemInput, Category, Location } from '../types';
import { CURRENCIES, STATUSES } from '../types';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { Field, FormError, Input, Select, Textarea } from './ui/Field';
import { Icon } from './ui/Icon';
import { categoryLabel, pathStr, sortedByPath, statusLabel } from '../lib/format';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { itemImageUrl } from '../lib/itemImage';
import { api } from '../lib/api';
import { formatTagInput, parseTagInput, MAX_TAGS_CLIENT, MAX_TAG_LENGTH_CLIENT } from '../lib/tags';
import type { ImageAction } from '../lib/itemImage';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export type { ImageAction };

/**
 * Add / edit item. Core fields (name, category, location, status, warranty,
 * notes) are always visible; rarer ones live under "More details", which
 * opens automatically when the item already has any of them.
 */
export function ItemForm({
  item,
  categories,
  locations,
  onSave,
  onClose,
  onArchive,
}: {
  item?: Item;
  categories: Category[];
  locations: Location[];
  onSave: (data: ItemInput, image: ImageAction) => Promise<void>;
  onClose: () => void;
  onArchive?: () => void;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const ordered = sortedByPath(locations);
  const [name, setName] = useState(item?.name ?? '');
  const [categoryId, setCategoryId] = useState<string>(
    item?.categoryId ? String(item.categoryId) : categories[0] ? String(categories[0].id) : ''
  );
  const [locationId, setLocationId] = useState<string>(
    item?.locationId ? String(item.locationId) : ordered[0] ? String(ordered[0].id) : ''
  );
  const [status, setStatus] = useState(item?.status ?? 'with_me');
  const [purchaseDate, setPurchaseDate] = useState(item?.purchaseDate ?? '');
  const [value, setValue] = useState(item?.value != null ? String(item.value) : '');
  // A new item starts in the account currency; an existing one keeps its own, so editing never silently re-denominates it.
  const [currency, setCurrency] = useState<Currency>(item?.currency ?? user?.currency ?? CURRENCIES[0]);
  const [warranty, setWarranty] = useState(item?.warrantyExpiration ?? '');
  const [serial, setSerial] = useState(item?.serialNumber ?? '');
  const [notes, setNotes] = useState(item?.notes ?? '');
  const [quantity, setQuantity] = useState(item?.quantity != null ? String(item.quantity) : '1');
  const [brand, setBrand] = useState(item?.brand ?? '');
  const [model, setModel] = useState(item?.model ?? '');
  const [tagText, setTagText] = useState(formatTagInput(item?.tags ?? []));

  // Keyword-based category hint (not AI): only offered, never applied automatically.
  const [suggestion, setSuggestion] = useState<{ categoryId: number; name: string } | null>(null);
  useEffect(() => {
    if (item || name.trim().length < 3) { setSuggestion(null); return; }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.suggestCategory(name.trim(), brand.trim() || undefined, model.trim() || undefined)
        .then(r => { if (!cancelled) setSuggestion(r.suggestion); })
        .catch(() => { if (!cancelled) setSuggestion(null); });
    }, 500);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [item, name, brand, model]);

  // Image: either a newly-chosen local file (uploaded after save), a
  // request to remove the existing one, or left untouched (null).
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | undefined>(() => itemImageUrl(item));
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Revoke the previous local preview URL whenever it's replaced or the
    // form unmounts, so chosen-then-replaced files don't leak memory.
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const pickImage = () => fileInputRef.current?.click();

  const onImageChosen = (file: File | undefined) => {
    if (!file) return;
    setImageError('');
    if (!file.type.startsWith('image/')) {
      setImageError(t('itemForm.photo.errorType'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(t('itemForm.photo.errorSize'));
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setImageFile(file);
    setRemoveImage(false);
    setImagePreview(url);
  };

  const clearImage = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setImageFile(null);
    setRemoveImage(true);
    setImagePreview(undefined);
    setImageError('');
  };

  const hasExtras = Boolean(item && (item.purchaseDate || item.value != null || item.serialNumber || item.brand || item.model || item.tags.length > 0 || item.quantity > 1));
  const [showMore, setShowMore] = useState(hasExtras);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameError = attempted && !name.trim() ? t('itemForm.name.error') : undefined;
  const isBorrowed = item?.status === 'borrowed';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!name.trim()) return;
    if (purchaseDate && warranty && warranty < purchaseDate) {
      setError(t('itemForm.error.warrantyBeforePurchase'));
      return;
    }
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 9999) {
      setShowMore(true);
      setError(t('itemForm.error.quantity'));
      return;
    }
    const tags = parseTagInput(tagText);
    if (tags.length > MAX_TAGS_CLIENT || tags.some(tag => tag.length > MAX_TAG_LENGTH_CLIENT)) {
      setShowMore(true);
      setError(t('itemForm.error.tags', { max: MAX_TAGS_CLIENT, length: MAX_TAG_LENGTH_CLIENT }));
      return;
    }
    setBusy(true);
    setError(null);
    const imageAction: ImageAction = imageFile ? { file: imageFile } : removeImage ? { remove: true } : null;
    try {
      await onSave(
        {
          name: name.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
          locationId: locationId ? Number(locationId) : null,
          status,
          // This form does not edit the legacy external-link field — it
          // manages the real upload via `imageAction` — so an existing
          // photoUrl is passed through unchanged, except when the person
          // removed the photo (otherwise the old link would reappear).
          photoUrl: removeImage ? null : item?.photoUrl ?? null,
          purchaseDate: purchaseDate || null,
          value: value === '' ? null : Number(value),
          currency,
          warrantyExpiration: warranty || null,
          serialNumber: serial.trim() || null,
          notes: notes.trim() || null,
          quantity: qty,
          brand: brand.trim() || null,
          model: model.trim() || null,
          tags,
        },
        imageAction
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t('itemForm.error.save'));
      setBusy(false);
    }
  };

  return (
    <Dialog title={item ? t('itemForm.title.edit') : t('itemForm.title.add')} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {error && <FormError message={error} />}

        <Field label={t('itemForm.name')} required error={nameError}>
          <Input
            autoFocus
            value={name}
            invalid={Boolean(nameError)}
            onChange={e => setName(e.target.value)}
            placeholder={t('itemForm.name.placeholder')}
            autoComplete="off"
            maxLength={200}
          />
        </Field>

        <Field label={t('itemForm.photo')}>
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-control bg-sunken">
              {imagePreview ? (
                <img src={imagePreview} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon name="image" className="h-6 w-6 text-faint" />
              )}
            </span>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={pickImage}>
                  <Icon name="camera" className="h-4 w-4" />
                  {imagePreview ? t('itemForm.photo.replace') : t('itemForm.photo.add')}
                </Button>
                {imagePreview && (
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={clearImage}>
                    {t('common.remove')}
                  </Button>
                )}
              </div>
              <span className="text-caption text-muted">{t('itemForm.photo.hint')}</span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={e => onImageChosen(e.target.files?.[0])}
            />
          </div>
          {imageError && (
            <span role="alert" className="mt-1.5 flex items-center gap-1.5 text-caption font-medium text-danger">
              <Icon name="alert" className="h-3.5 w-3.5 shrink-0" />
              {imageError}
            </span>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Field label={t('itemForm.category')}>
            <Select value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">{categoryLabel(null)}</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>
                  {categoryLabel(c.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('itemForm.location')}>
            <Select value={locationId} onChange={e => setLocationId(e.target.value)}>
              <option value="">{t('common.noLocation')}</option>
              {ordered.map(l => (
                <option key={l.id} value={l.id}>
                  {pathStr(l.id, locations)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {suggestion && String(suggestion.categoryId) !== categoryId && (
          <p className="-mt-2 mb-4 flex flex-wrap items-center gap-x-2 text-meta text-muted">
            <span>{t('itemForm.suggest', { name: categoryLabel(suggestion.name) })}</span>
            <button type="button" className="font-medium text-accent-ink hover:underline" onClick={() => setCategoryId(String(suggestion.categoryId))}>
              {t('itemForm.suggest.use')}
            </button>
            <span className="text-caption">{t('itemForm.suggest.note')}</span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Field label={t('itemForm.status')} hint={isBorrowed ? t('itemForm.status.hint') : undefined}>
            {isBorrowed ? (
              <Select value="borrowed" disabled>
                <option value="borrowed">{statusLabel('borrowed')}</option>
              </Select>
            ) : (
              <Select value={status} onChange={e => setStatus(e.target.value as typeof status)}>
                {STATUSES.filter(s => s !== 'borrowed').map(s => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('itemForm.warranty')}>
            <Input type="date" value={warranty} onChange={e => setWarranty(e.target.value)} />
          </Field>
        </div>

        <Field label={t('itemForm.description')}>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} maxLength={5000} placeholder={t('itemForm.description.placeholder')} />
        </Field>

        <button
          type="button"
          onClick={() => setShowMore(open => !open)}
          aria-expanded={showMore}
          className="mb-4 inline-flex items-center gap-1.5 rounded-chip text-meta font-medium text-accent-ink hover:underline"
        >
          <Icon name="chevronRight" className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-90' : ''}`} />
          {t('itemForm.more')}
        </button>

        {showMore && (
          <div className="mb-1 rounded-control border border-line bg-canvas p-4">
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field label={t('itemForm.purchased')}>
                <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
              </Field>
              <Field label={t('itemForm.serial')}>
                <Input value={serial} onChange={e => setSerial(e.target.value)} placeholder={t('common.optional')} autoComplete="off" maxLength={100} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field label={t('itemForm.brand')}>
                <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder={t('common.optional')} autoComplete="off" maxLength={100} />
              </Field>
              <Field label={t('itemForm.model')}>
                <Input value={model} onChange={e => setModel(e.target.value)} placeholder={t('common.optional')} autoComplete="off" maxLength={100} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <Field label={t('itemForm.quantity')}>
                <Input type="number" min="1" max="9999" step="1" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </Field>
              <Field label={t('itemForm.tags')} hint={t('itemForm.tags.hint')}>
                <Input value={tagText} onChange={e => setTagText(e.target.value)} placeholder={t('itemForm.tags.placeholder')} autoComplete="off" />
              </Field>
            </div>
            <Field label={t('itemForm.value')} hint={t('itemForm.currency.hint')} className="mb-0">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="number"
                  min="0"
                  max="9999999999"
                  step="0.01"
                  inputMode="decimal"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="0"
                  className="min-w-0 sm:flex-1"
                />
                <div className="sm:w-52 sm:shrink-0">
                  <Select aria-label={t('itemForm.currency')} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                    {CURRENCIES.map(code => (
                      <option key={code} value={code}>
                        {t(`common.currency.${code}` as const)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Field>
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
          {item && onArchive && (
            <Button variant="ghost" className="text-danger hover:text-danger sm:mr-auto" onClick={onArchive}>
              {t('itemForm.remove')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {item ? t('itemForm.save') : t('itemForm.title.add')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
