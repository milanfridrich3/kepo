import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, api } from '../lib/api';
import type { HouseholdData, SharedItem } from '../types';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { Button } from '../components/ui/Button';
import { Card, PageHeader, Section } from '../components/ui/Card';
import { Dialog } from '../components/ui/Dialog';
import { Badge } from '../components/ui/Badge';
import { Field, FormError, Input } from '../components/ui/Field';
import { Icon } from '../components/ui/Icon';
import { ErrorState, Skeleton } from '../components/ui/States';
import { categoryLabel, fmtDate, statusLabel } from '../lib/format';

type Confirm = 'leave' | 'delete' | { remove: number; name: string } | null;

export function Household() {
  const { t } = useI18n();
  const toast = useToast();
  const [state, setState] = useState<{ household: HouseholdData | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [newInvite, setNewInvite] = useState<{ code: string; expiresAt: string } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const load = useCallback(() => {
    setError(null);
    api.household().then(setState).catch(err => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, okMessage?: string) => {
    setBusy(true); setFormError(null);
    try { await fn(); if (okMessage) toast.success(okMessage); load(); return true; }
    catch (err) { setFormError(err instanceof ApiError ? err.message : t('household.failed')); return false; }
    finally { setBusy(false); }
  };

  const header = <PageHeader title={t('household.title')} subtitle={t('household.subtitle')} />;
  if (error) return (<>{header}<ErrorState message={error} onRetry={load} /></>);
  if (!state) return (<div role="status" aria-label={t('common.loading')}>{header}<Skeleton className="h-40 w-full" /></div>);

  const h = state.household;
  if (!h) {
    return (
      <div className="max-w-xl space-y-6">
        {header}
        {formError && <FormError message={formError} />}
        <Card className="p-4">
          <h2 className="text-body font-semibold text-ink">{t('household.create.title')}</h2>
          <p className="mb-3 mt-1 text-meta text-muted">{t('household.create.body')}</p>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); void act(async () => { await api.createHousehold(name.trim()); setName(''); }); }} className="flex gap-2">
            <Input aria-label={t('household.create.name')} placeholder={t('household.create.name')} value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="off" />
            <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{t('household.create.button')}</Button>
          </form>
        </Card>
        <Card className="p-4">
          <h2 className="text-body font-semibold text-ink">{t('household.join.title')}</h2>
          <p className="mb-3 mt-1 text-meta text-muted">{t('household.join.body')}</p>
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); void act(async () => { await api.joinHousehold(code); setCode(''); }, t('household.joined')); }} className="flex gap-2">
            <Input aria-label={t('household.join.code')} placeholder="ABCDE-FGHJK" value={code} onChange={e => setCode(e.target.value)} maxLength={20} autoComplete="off" autoCapitalize="characters" className="font-mono" />
            <Button type="submit" variant="primary" disabled={busy || !code.trim()}>{t('household.join.button')}</Button>
          </form>
        </Card>
        <p className="text-caption text-muted">{t('household.privacy')}</p>
      </div>
    );
  }

  const owner = h.role === 'owner';
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={h.name} subtitle={t('household.subtitle')} />
      {formError && <FormError message={formError} />}

      <Section title={t('household.members')} count={h.members.length}>
        <ul className="divide-y divide-line">
          {h.members.map(m => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
              <Icon name="user" className="h-4 w-4 text-muted" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body text-ink">{m.name}{m.isYou ? ` (${t('household.you')})` : ''}</div>
                <div className="text-caption text-muted">{m.shareItems ? t('household.sharing.on') : t('household.sharing.off')}</div>
              </div>
              <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{t(m.role === 'owner' ? 'household.role.owner' : 'household.role.member')}</Badge>
              {owner && !m.isYou && (
                <Button size="sm" variant="ghost" aria-label={t('household.remove', { name: m.name })} onClick={() => setConfirm({ remove: m.userId, name: m.name })}>
                  <Icon name="x" className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Card className="p-4">
        <label className="flex cursor-pointer items-start justify-between gap-4">
          <span>
            <span className="block text-body font-medium text-ink">{t('household.share.label')}</span>
            <span className="block text-meta text-muted">{t('household.share.hint')}</span>
          </span>
          <input type="checkbox" role="switch" className="mt-1 h-5 w-5 shrink-0" checked={h.shareItems} disabled={busy}
            onChange={e => void act(() => api.setHouseholdSharing(e.target.checked), t(e.target.checked ? 'household.share.enabled' : 'household.share.disabled'))} />
        </label>
        <p className="mt-3 text-caption text-muted">{t('household.privacy')}</p>
      </Card>

      {owner && (
        <Section title={t('household.invites')}>
          <div className="space-y-3 p-4 pt-0">
            {newInvite && (
              <div className="rounded-control border border-accent/30 bg-accent-soft p-3" role="status">
                <div className="text-meta text-accent-ink">{t('household.invite.created', { date: fmtDate(newInvite.expiresAt.slice(0, 10)) })}</div>
                <div className="mt-1 select-all font-mono text-title tracking-wider text-ink">{newInvite.code}</div>
                <div className="mt-1 text-caption text-muted">{t('household.invite.once')}</div>
              </div>
            )}
            {h.pendingInvites.length > 0 && (
              <ul className="divide-y divide-line rounded-control border border-line">
                {h.pendingInvites.map(i => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="text-meta text-muted">{t('household.invite.open', { date: fmtDate(i.expiresAt.slice(0, 10)) })}</span>
                    <Button size="sm" variant="ghost" onClick={() => void act(() => api.revokeInvite(i.id))}>{t('household.invite.revoke')}</Button>
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" disabled={busy} onClick={() => void act(async () => { setNewInvite(await api.createInvite()); })}>
              <Icon name="plus" className="h-4 w-4" />
              {t('household.invite.create')}
            </Button>
          </div>
        </Section>
      )}

      <SharedItems />

      <div className="flex flex-wrap gap-2">
        <Button variant="danger" size="sm" onClick={() => setConfirm(owner ? 'delete' : 'leave')}>
          {owner ? t('household.delete') : t('household.leave')}
        </Button>
      </div>

      {confirm && (
        <Dialog title={confirm === 'leave' ? t('household.leave.title') : confirm === 'delete' ? t('household.delete.title') : t('household.remove.title', { name: confirm.name })} onClose={() => setConfirm(null)} size="sm">
          <p className="text-body text-muted">{confirm === 'leave' ? t('household.leave.body') : confirm === 'delete' ? t('household.delete.body') : t('household.remove.body')}</p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button variant="danger" loading={busy} onClick={async () => {
              const c = confirm;
              const ok = await act(() => (c === 'leave' ? api.leaveHousehold() : c === 'delete' ? api.deleteHousehold() : api.removeHouseholdMember(c.remove)));
              if (ok) { setConfirm(null); setNewInvite(null); }
            }}>
              {confirm === 'leave' ? t('household.leave') : confirm === 'delete' ? t('household.delete') : t('household.remove.confirm')}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Read-only list of what the other members chose to share. Money, serial numbers, notes, loans and photos are never part of it. */
function SharedItems() {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<SharedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      api.householdItems(q.trim() || undefined)
        .then(r => { if (!cancelled) { setItems(r.items); setError(null); } })
        .catch(err => { if (!cancelled) setError(err.message); });
    }, q ? 300 : 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [q]);

  return (
    <Section title={t('household.shared.title')} count={items?.length}>
      <div className="px-4 pb-3">
        <Input type="search" aria-label={t('household.shared.search')} placeholder={t('household.shared.search')} value={q} onChange={e => setQ(e.target.value)} maxLength={100} />
      </div>
      {error && <p className="px-4 pb-4 text-meta text-danger">{error}</p>}
      {items && items.length === 0 && !error && <p className="px-4 pb-4 text-meta text-muted">{q ? t('household.shared.noMatch') : t('household.shared.empty')}</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map(i => (
            <li key={`${i.ownerUserId}-${i.id}`} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-body font-medium text-ink">{i.name}{i.quantity > 1 ? ` ×${i.quantity}` : ''}</span>
                <span className="shrink-0 text-caption text-muted">{i.ownerName}</span>
              </div>
              <div className="truncate text-meta text-muted">
                {[categoryLabel(i.categoryName), i.locationPath ?? t('common.noLocation'), [i.brand, i.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')}
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge>{statusLabel(i.status)}</Badge>
                {i.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
