import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { applyImageAction } from '../lib/itemImage';
import type { Item, Category, Location } from '../types';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../context/I18nContext';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Button, buttonClass } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';
import { Dialog } from '../components/ui/Dialog';
import { EmptyState, ErrorState, Skeleton } from '../components/ui/States';
import { Thumb } from '../components/Thumb';
import { ItemForm } from '../components/ItemForm';
import { ItemFiles } from '../components/ItemFiles';
import { MoveModal } from '../components/MoveModal';
import { LendModal } from '../components/LendModal';
import { categoryLabel, daysUntil, dueLabel, fmtDate, fmtMoney, fmtShort, pathFor, statusLabel, warrantyDaysLabel, warrantyState } from '../lib/format';

function Detail({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="mb-1 text-caption font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="text-body text-ink">{children}</dd>
    </div>
  );
}

export function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t, rich } = useI18n();
  const { version, bump } = useData();
  const [item, setItem] = useState<Item | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);
  const [modal, setModal] = useState<'edit' | 'move' | 'lend' | 'loan' | 'archive' | null>(null);
  const [returning, setReturning] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setError(null);
    api.item(Number(id))
      .then(r => setItem(r.item))
      .catch(err => {
        const notFound = err instanceof ApiError && (err.status === 404 || err.status === 400);
        setError({ message: err instanceof Error ? err.message : t('itemDetail.loadError'), notFound });
      });
  }, [id, t]);

  useEffect(() => {
    load();
  }, [load, version]);

  useEffect(() => {
    api.categories().then(r => setCategories(r.categories)).catch(() => {});
    api.locations().then(r => setLocations(r.locations)).catch(() => {});
  }, []);

  const back = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="mb-4 inline-flex h-9 items-center gap-1 rounded-control pr-2 text-meta font-medium text-muted transition hover:text-ink"
    >
      <Icon name="chevronLeft" className="h-4 w-4" />
      {t('common.back')}
    </button>
  );

  if (error) {
    return (
      <div>
        {back}
        {error.notFound ? (
          <EmptyState
            icon="items"
            title={t('itemDetail.notFound.title')}
            body={t('itemDetail.notFound.body')}
            action={
              <Link to="/stuff" className={buttonClass('primary')}>
                {t('itemDetail.notFound.action')}
              </Link>
            }
          />
        ) : (
          <ErrorState message={error.message} onRetry={load} />
        )}
      </div>
    );
  }
  if (!item) {
    return (
      <div role="status" aria-label={t('common.loading')}>
        {back}
        <Skeleton className="mb-4 h-32 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const path = pathFor(item.locationId, locations);
  const warranty = warrantyState(item.warrantyExpiration);
  const borrower = item.borrower;
  const overdue = borrower?.expectedReturnDate ? (daysUntil(borrower.expectedReturnDate) ?? 0) < 0 : false;

  const markReturned = async () => {
    setReturning(true);
    try {
      await api.returnItem(item.id);
      toast.success(t('itemDetail.returned', { name: item.name }));
      bump();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('itemDetail.returnError'));
    } finally {
      setReturning(false);
    }
  };

  const archive = async () => {
    setArchiving(true);
    try {
      await api.archiveItem(item.id);
      toast.success(t('itemDetail.removed', { name: item.name }));
      bump();
      navigate('/stuff', { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('itemDetail.removeError'));
      setArchiving(false);
      setModal(null);
    }
  };

  return (
    <div className="max-w-2xl">
      {back}

      <Card className="overflow-hidden">
        <div className="flex items-start gap-4 p-5">
          <Thumb item={item} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-title text-ink">{item.name}</h1>
            <p className="mt-0.5 text-meta text-muted">{categoryLabel(item.categoryName)}</p>
            <div className="mt-2.5">
              <StatusBadge status={item.status} />
            </div>
          </div>
        </div>

        {borrower && (
          <div className={`flex items-start gap-2.5 border-t border-line px-5 py-3 text-meta ${overdue ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent-ink'}`}>
            <Icon name="borrowed" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {rich('itemDetail.lentTo', { name: borrower.borrowerName, date: fmtShort(borrower.lentDate) }, { b: text => <strong className="font-semibold">{text}</strong> })}
              {borrower.expectedReturnDate
                ? ` · ${t('itemDetail.lentDue', { due: dueLabel(borrower.expectedReturnDate).toLowerCase(), date: fmtShort(borrower.expectedReturnDate) })}`
                : ''}
            </span>
          </div>
        )}

        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 border-t border-line p-5 sm:grid-cols-2">
          <Detail label={t('itemDetail.location')}>
            {path.length === 0 ? (
              <span className="text-muted">{t('common.noLocation')}</span>
            ) : (
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                {path.map((l, index) => (
                  <span key={l.id} className="inline-flex items-center gap-1">
                    {index > 0 && <Icon name="chevronRight" className="h-3.5 w-3.5 text-faint" />}
                    <Link to={`/stuff?locationId=${l.id}`} className={index === path.length - 1 ? 'font-medium hover:underline' : 'text-muted hover:underline'}>
                      {l.name}
                    </Link>
                  </span>
                ))}
              </span>
            )}
          </Detail>
          <Detail label={t('itemDetail.status')}>{borrower ? t('itemDetail.status.lentTo', { name: borrower.borrowerName }) : statusLabel(item.status)}</Detail>
          <Detail label={t('itemDetail.warranty')}>
            {warranty ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{warranty.days < 0 ? t('itemDetail.warranty.expired') : t('itemDetail.warranty.until', { date: fmtDate(item.warrantyExpiration) })}</span>
                <Badge tone={warranty.tone === 'emerald' ? 'success' : warranty.tone === 'amber' ? 'warning' : 'neutral'}>
                  {warrantyDaysLabel(warranty.days)}
                </Badge>
              </span>
            ) : (
              <span className="text-muted">{t('itemDetail.warranty.none')}</span>
            )}
          </Detail>
          <Detail label={t('itemDetail.purchased')}>{item.purchaseDate ? fmtDate(item.purchaseDate) : <span className="text-muted">—</span>}</Detail>
          <Detail label={t('itemDetail.value')}>{item.value != null ? fmtMoney(item.value, item.currency) : <span className="text-muted">—</span>}</Detail>
          {(item.brand || item.model) && (
            <Detail label={item.brand && item.model ? `${t('itemDetail.brand')} · ${t('itemDetail.model')}` : item.brand ? t('itemDetail.brand') : t('itemDetail.model')}>
              {[item.brand, item.model].filter(Boolean).join(' · ')}
            </Detail>
          )}
          {item.quantity > 1 && <Detail label={t('itemDetail.quantity')}>{item.quantity}</Detail>}
          {item.tags.length > 0 && (
            <Detail label={t('itemDetail.tags')} wide>
              <span className="flex flex-wrap gap-1.5">
                {item.tags.map(tag => (
                  <Link key={tag} to={`/stuff?tags=${encodeURIComponent(tag)}`} className="rounded-chip bg-sunken px-2 py-0.5 text-meta text-muted hover:text-ink">
                    {tag}
                  </Link>
                ))}
              </span>
            </Detail>
          )}
          {item.serialNumber && (
            <Detail label={t('itemDetail.serial')}>
              <span className="break-all font-mono text-meta">{item.serialNumber}</span>
            </Detail>
          )}
          <Detail label={t('itemDetail.description')} wide>
            {item.notes ? <p className="whitespace-pre-wrap break-words">{item.notes}</p> : <span className="text-muted">{t('itemDetail.description.none')}</span>}
          </Detail>
        </dl>

        <ItemFiles itemId={item.id} onChanged={bump} />

        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas p-4">
          {item.status === 'borrowed' ? (
            <>
              <Button variant="primary" loading={returning} onClick={markReturned}>
                <Icon name="check" className="h-4 w-4" />
                {t('itemDetail.markReturned')}
              </Button>
              <Button onClick={() => setModal('loan')}>
                <Icon name="edit" className="h-4 w-4" />
                {t('itemDetail.editLoan')}
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={() => setModal('lend')}>
              <Icon name="borrowed" className="h-4 w-4" />
              {t('itemDetail.lend')}
            </Button>
          )}
          <Button onClick={() => setModal('move')}>
            <Icon name="move" className="h-4 w-4" />
            {t('itemDetail.move')}
          </Button>
          <Button onClick={() => setModal('edit')}>
            <Icon name="edit" className="h-4 w-4" />
            {t('common.edit')}
          </Button>
          <Link to={`/labels?item=${item.id}`} className={buttonClass('secondary')}>
            <Icon name="printer" className="h-4 w-4" />
            {t('itemDetail.label')}
          </Link>
          <Button variant="ghost" className="ml-auto text-danger hover:text-danger" onClick={() => setModal('archive')}>
            <Icon name="trash" className="h-4 w-4" />
            {t('common.remove')}
          </Button>
        </div>
      </Card>

      {modal === 'edit' && (
        <ItemForm
          item={item}
          categories={categories}
          locations={locations}
          onClose={() => setModal(null)}
          onArchive={() => setModal('archive')}
          onSave={async (data, image) => {
            await api.updateItem(item.id, data);
            const imageError = await applyImageAction(item.id, image);
            setModal(null);
            if (imageError) toast.error(t('itemDetail.savedPhotoError', { error: imageError }));
            else toast.success(t('itemDetail.saved'));
            bump();
          }}
        />
      )}
      {modal === 'move' && (
        <MoveModal
          item={item}
          locations={locations}
          onClose={() => setModal(null)}
          onSave={async locationId => {
            await api.moveItem(item.id, locationId);
            setModal(null);
            toast.success(t('itemDetail.moved', { name: item.name }));
            bump();
          }}
        />
      )}
      {modal === 'lend' && (
        <LendModal
          item={item}
          onClose={() => setModal(null)}
          onSave={async (name, date) => {
            await api.lendItem(item.id, name, date);
            setModal(null);
            toast.success(t('itemDetail.lent', { name: item.name, borrower: name }));
            bump();
          }}
        />
      )}
      {modal === 'loan' && borrower && (
        <LendModal
          item={item}
          existing={borrower}
          onClose={() => setModal(null)}
          onSave={async (name, date) => {
            await api.updateLoan(item.id, name, date);
            setModal(null);
            toast.success(t('itemDetail.loanUpdated'));
            bump();
          }}
        />
      )}
      {modal === 'archive' && (
        <Dialog title={t('itemDetail.archive.title')} onClose={() => setModal(null)} size="sm">
          <p className="break-words text-body text-muted">
            {t(item.status === 'borrowed' ? 'itemDetail.archive.bodyBorrowed' : 'itemDetail.archive.body', { name: item.name })}
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setModal(null)}>{t('itemDetail.archive.keep')}</Button>
            <Button variant="danger" loading={archiving} onClick={archive}>
              {t('itemDetail.archive.confirm')}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
