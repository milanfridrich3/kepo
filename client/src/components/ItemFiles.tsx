import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api, itemDocumentUrl, itemPhotoUrl } from '../lib/api';
import type { DocumentKind, ItemDocument, ItemPhoto } from '../types';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import { Dialog } from './ui/Dialog';
import { FormError, Select } from './ui/Field';
import { Icon } from './ui/Icon';
import { isNativeApp } from '../lib/download';
import { fmtShort } from '../lib/format';

export const MAX_EXTRA_PHOTOS = 5;
export const MAX_DOCUMENTS = 20;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const KINDS: DocumentKind[] = ['receipt', 'warranty', 'manual', 'other'];

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} kB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** More photos and documents (receipts, warranty cards, manuals) of one item. All requests are scoped to the signed-in user by the server. */
export function ItemFiles({ itemId, onChanged }: { itemId: number; onChanged: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [photos, setPhotos] = useState<ItemPhoto[] | null>(null);
  const [docs, setDocs] = useState<ItemDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<DocumentKind>('receipt');
  const [viewing, setViewing] = useState<ItemPhoto | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);
  const native = isNativeApp();

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([api.itemPhotos(itemId), api.itemDocuments(itemId)]);
      setPhotos(p.photos); setDocs(d.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('files.loadFailed'));
    }
  }, [itemId, t]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, fallback: string) => {
    setBusy(true); setError(null);
    try { await fn(); await load(); onChanged(); }
    catch (err) { setError(err instanceof ApiError ? err.message : fallback); }
    finally { setBusy(false); }
  };

  const addPhoto = (file: File | undefined) => {
    if (photoInput.current) photoInput.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError(t('itemForm.photo.errorType')); return; }
    if (file.size > MAX_FILE_BYTES) { setError(t('itemForm.photo.errorSize')); return; }
    void run(() => api.addItemPhoto(itemId, file), t('files.photo.addFailed'));
  };
  const addDoc = (file: File | undefined) => {
    if (docInput.current) docInput.current.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError(t('files.doc.tooLarge')); return; }
    void run(async () => { await api.addItemDocument(itemId, file, kind); toast.success(t('files.doc.added')); }, t('files.doc.addFailed'));
  };

  if (!photos || !docs) return error ? <FormError message={error} /> : null;

  return (
    <div className="border-t border-line p-5" data-testid="item-files">
      {error && <FormError message={error} />}

      <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
        {t('files.photos')} <span className="normal-case">· {photos.length}/{MAX_EXTRA_PHOTOS}</span>
      </h2>
      <div className="mb-5 flex flex-wrap gap-2">
        {photos.map(p => (
          <div key={p.id} className="group relative">
            <button type="button" onClick={() => setViewing(p)} aria-label={t('files.photo.open')} className="block overflow-hidden rounded-control border border-line">
              <img src={itemPhotoUrl(itemId, p.id)} alt="" className="h-20 w-20 object-cover" loading="lazy" />
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label={t('files.photo.delete')}
              onClick={() => void run(() => api.deleteItemPhoto(itemId, p.id), t('files.photo.deleteFailed'))}
              className="absolute -right-1.5 -top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-sm hover:text-danger"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {photos.length < MAX_EXTRA_PHOTOS && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => photoInput.current?.click()} className="h-20 w-20 flex-col">
              <Icon name="camera" className="h-4 w-4" />
              {t('files.photo.add')}
            </Button>
            <input ref={photoInput} type="file" accept="image/*" className="sr-only" aria-label={t('files.photo.add')} onChange={e => addPhoto(e.target.files?.[0])} />
          </>
        )}
      </div>

      <h2 className="mb-2 text-caption font-medium uppercase tracking-wide text-muted">
        {t('files.docs')} <span className="normal-case">· {docs.length}/{MAX_DOCUMENTS}</span>
      </h2>
      {docs.length === 0 && <p className="mb-3 text-meta text-muted">{t('files.docs.empty')}</p>}
      {docs.length > 0 && (
        <ul className="mb-3 divide-y divide-line overflow-hidden rounded-control border border-line">
          {docs.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
              <Icon name="file" className="h-4 w-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body text-ink">{d.filename}</div>
                <div className="truncate text-caption text-muted">{formatBytes(d.sizeBytes)} · {fmtShort(d.createdAt)}</div>
              </div>
              <Badge>{t(`files.kind.${d.kind}` as const)}</Badge>
              {native ? null : (
                <a href={itemDocumentUrl(itemId, d.id)} className="rounded-control p-1.5 text-muted hover:bg-hover hover:text-ink" aria-label={t('files.doc.download', { name: d.filename })} download>
                  <Icon name="download" className="h-4 w-4" />
                </a>
              )}
              <button
                type="button"
                disabled={busy}
                aria-label={t('files.doc.delete', { name: d.filename })}
                onClick={() => void run(() => api.deleteItemDocument(itemId, d.id), t('files.doc.deleteFailed'))}
                className="rounded-control p-1.5 text-muted hover:bg-hover hover:text-danger"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {native && docs.length > 0 && <p className="mb-3 text-caption text-muted">{t('files.doc.nativeNote')}</p>}
      {docs.length < MAX_DOCUMENTS && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label={t('files.doc.kind')} value={kind} onChange={e => setKind(e.target.value as DocumentKind)} className="w-auto">
            {KINDS.map(k => <option key={k} value={k}>{t(`files.kind.${k}` as const)}</option>)}
          </Select>
          <Button type="button" size="sm" disabled={busy} onClick={() => docInput.current?.click()}>
            <Icon name="plus" className="h-4 w-4" />
            {t('files.doc.add')}
          </Button>
          <input ref={docInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('files.doc.add')} onChange={e => addDoc(e.target.files?.[0])} />
          <span className="text-caption text-muted">{t('files.doc.hint')}</span>
        </div>
      )}

      {viewing && (
        <Dialog title={t('files.photos')} onClose={() => setViewing(null)}>
          <img src={itemPhotoUrl(itemId, viewing.id)} alt="" className="max-h-[70vh] w-full rounded-control object-contain" />
        </Dialog>
      )}
    </div>
  );
}
