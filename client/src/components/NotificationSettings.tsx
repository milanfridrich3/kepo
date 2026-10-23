import { useEffect, useState } from 'react';
import { API_URL, ApiError, api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { Button } from './ui/Button';
import { FormError, Input } from './ui/Field';

/** Opt-in daily e-mail with warranties ending and loans due (default off). */
export function ReminderEmailSetting() {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const on = user.reminderEmails === true;

  const change = async (next: boolean) => {
    setBusy(true);
    try {
      const { user: updated } = await api.updatePreferences({ reminderEmails: next });
      updateUser(updated);
      toast.success(t(next ? 'reminders.emails.on' : 'reminders.emails.off'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('reminders.emails.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 p-4">
      <span>
        <span className="block text-body font-medium text-ink">{t('reminders.emails')}</span>
        <span className="block text-meta text-muted">{t('reminders.emails.hint')}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={busy}
        onChange={e => void change(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent,#2563eb)]"
      />
    </label>
  );
}

function feedAddress(token: string): string {
  const base = new URL(API_URL, window.location.origin).toString().replace(/\/$/, '');
  return `${base}/calendar/${token}.ics`;
}

/** Private, read-only .ics address. The server keeps only a hash, so the address is shown once. */
export function CalendarFeedSetting() {
  const { t } = useI18n();
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.calendarFeed().then(r => setEnabled(r.enabled)).catch(() => setEnabled(false)); }, []);

  const create = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.enableCalendarFeed();
      setAddress(feedAddress(r.token));
      setEnabled(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('calendar.failed'));
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true); setError(null);
    try {
      await api.disableCalendarFeed();
      setEnabled(false); setAddress(null);
      toast.success(t('calendar.disabled'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('calendar.failed'));
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(address ?? ''); toast.success(t('calendar.copied')); }
    catch { toast.error(t('calendar.copyFailed')); }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-body font-medium text-ink">{t('calendar.title')}</p>
        <p className="text-meta text-muted">{t('calendar.hint')}</p>
        {enabled !== null && <p className="mt-1 text-meta text-muted">{enabled ? t('calendar.on') : t('calendar.off')}</p>}
      </div>
      {error && <FormError message={error} />}
      {address && (
        <div className="flex flex-col gap-2">
          <label className="text-meta font-medium text-ink" htmlFor="calendar-address">{t('calendar.address')}</label>
          <div className="flex gap-2">
            <Input id="calendar-address" readOnly value={address} onFocus={e => e.currentTarget.select()} />
            <Button size="sm" onClick={() => void copy()}>{t('calendar.copy')}</Button>
          </div>
          <p className="text-caption text-warning">{t('calendar.warning')}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} disabled={busy || enabled === null} onClick={() => void create()}>
          {enabled ? t('calendar.rotate') : t('calendar.enable')}
        </Button>
        {enabled && <Button size="sm" variant="danger" disabled={busy} onClick={() => void disable()}>{t('calendar.disable')}</Button>}
      </div>
    </div>
  );
}
