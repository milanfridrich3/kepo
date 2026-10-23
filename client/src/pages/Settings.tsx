import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { ThemePreference } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useI18n } from '../context/I18nContext';
import { Avatar, Card, PageHeader } from '../components/ui/Card';
import { Button, Spinner } from '../components/ui/Button';
import { Field, FormError, Input, Select } from '../components/ui/Field';
import { Dialog } from '../components/ui/Dialog';
import { SegmentedControl } from '../components/ui/Controls';
import { Icon } from '../components/ui/Icon';
import { api, ApiError } from '../lib/api';
import type { ImportReport } from '../lib/api';
import { avatarUrl } from '../lib/avatar';
import { exportCsvFileName, exportFileName, isNativeApp, saveJsonFile, saveTextFile } from '../lib/download';
import { fmtDate } from '../lib/format';
import { translate } from '../i18n';
import type { TranslationKey } from '../i18n';
import { CURRENCIES, LANGUAGES } from '../types';
import type { Currency, Language } from '../types';

const THEME_ICONS: { value: ThemePreference; icon: 'sun' | 'moon' | 'monitor' }[] = [
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
  { value: 'system', icon: 'monitor' },
];

const CURRENCY_LABEL_KEYS = {
  CZK: 'common.currency.CZK',
  EUR: 'common.currency.EUR',
  USD: 'common.currency.USD',
  GBP: 'common.currency.GBP',
} as const satisfies Record<Currency, TranslationKey>;

import { ReminderEmailSetting, CalendarFeedSetting } from '../components/NotificationSettings';
import { FeedbackSettings } from '../components/FeedbackSettings';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-muted">{title}</h2>
      <Card className="divide-y divide-line">{children}</Card>
    </section>
  );
}

/** Avatar with a camera-button overlay for upload, and a remove action once one is set. */
function AvatarEditor() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null);
  const [error, setError] = useState('');

  if (!user) return null;
  const hasAvatar = Boolean(user.avatarUpdatedAt);

  const pickFile = () => inputRef.current?.click();

  const onFileChosen = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError(t('settings.avatar.notImage'));
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError(t('settings.avatar.tooLarge'));
      return;
    }
    setBusy('uploading');
    try {
      const { user: updated } = await api.uploadAvatar(file);
      updateUser(updated);
      toast.success(t('settings.avatar.updated'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.avatar.uploadFailed'));
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    setBusy('removing');
    setError('');
    try {
      const { user: updated } = await api.removeAvatar();
      updateUser(updated);
      toast.success(t('settings.avatar.removed'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.avatar.removeFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={user.name} src={avatarUrl(user)} className="h-16 w-16 text-heading" />
          {busy === 'uploading' && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
              <Spinner className="h-5 w-5 text-white" />
            </span>
          )}
          <button
            type="button"
            onClick={pickFile}
            disabled={busy !== null}
            aria-label={t('settings.avatar.upload')}
            className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-muted shadow-overlay transition hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-50"
          >
            <Icon name="camera" className="h-3.5 w-3.5" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={e => onFileChosen(e.target.files?.[0])}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{user.name}</p>
          <p className="truncate text-meta text-muted">{user.email}</p>
          <p className="mt-0.5 text-caption text-muted">{t('settings.avatar.memberSince', { date: fmtDate(user.createdAt) })}</p>
        </div>
        {hasAvatar && (
          <Button variant="ghost" size="sm" loading={busy === 'removing'} disabled={busy !== null} onClick={removeAvatar}>
            {t('settings.avatar.remove')}
          </Button>
        )}
      </div>
      {error && <p className="mt-3 flex items-center gap-1.5 text-caption font-medium text-danger"><Icon name="alert" className="h-3.5 w-3.5 shrink-0" />{error}</p>}
    </div>
  );
}

/** Display name, editable inline. */
function NameEditor() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const start = () => {
    setName(user.name);
    setError('');
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length === 0) {
      setError(t('settings.name.required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { user: updated } = await api.updateProfile({ name: name.trim() });
      updateUser(updated);
      toast.success(t('settings.name.updated'));
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.name.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-body font-medium text-ink">{t('settings.name.label')}</p>
          <p className="text-meta text-muted">{user.name}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={start}>
          <Icon name="edit" className="h-4 w-4" />
          {t('settings.name.edit')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="p-4">
      {error && <FormError message={error} />}
      <Field label={t('settings.name.label')} required className="mb-3">
        <Input value={name} onChange={e => setName(e.target.value)} invalid={Boolean(error)} autoFocus maxLength={120} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={saving}>{t('common.save')}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

/** Email change, gated behind the current password. The new address starts unverified: once `updateUser` runs, ProtectedRoute sends the person to the verification screen to enter the code. */
function EmailEditor() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const start = () => {
    setEmail(user.email);
    setPassword('');
    setError('');
    setEditing(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError(t('settings.email.invalid'));
      return;
    }
    if (password.length === 0) {
      setError(t('settings.email.passwordRequired'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { user: updated, verification } = await api.updateEmail({ email: email.trim(), currentPassword: password });
      setEditing(false);
      if (verification.emailSent) toast.success(t('settings.email.codeSent', { email: updated.email }));
      else toast.info(t('settings.email.codeNotSent', { email: updated.email }));
      // The new address is unverified, so ProtectedRoute redirects to the verification screen from here.
      updateUser(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.email.failed'));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-body font-medium text-ink">{t('settings.email.label')}</p>
          <p className="text-meta text-muted">{user.email}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={start}>
          <Icon name="mail" className="h-4 w-4" />
          {t('settings.email.change')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="p-4">
      {error && <FormError message={error} />}
      <Field label={t('settings.email.newLabel')} required hint={t('settings.email.newHint')} className="mb-3">
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} invalid={Boolean(error)} autoFocus />
      </Field>
      <Field label={t('settings.email.passwordLabel')} required hint={t('settings.email.passwordHint')} className="mb-3">
        <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={saving}>{t('common.save')}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

/** Change-password form, collapsed behind a button until opened. */
function PasswordEditor() {
  const toast = useToast();
  const { t } = useI18n();
  const { logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError('');
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (current.length === 0) {
      setError(t('settings.password.currentRequired'));
      return;
    }
    if (next.length < 8) {
      setError(t('settings.password.tooShort'));
      return;
    }
    if (next !== confirm) {
      setError(t('settings.password.mismatch'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.updatePassword({ currentPassword: current, newPassword: next });
      toast.success(t('settings.password.changed'));
      // This app's sessions are a stateless signed cookie with no
      // server-side revocation list (see server/src/utils/jwt.ts): the
      // endpoint already cleared this session's cookie, so logging out
      // here just brings the client's own state in sync and sends the
      // person back to sign in with the new password.
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.password.failed'));
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-body font-medium text-ink">{t('settings.password.label')}</p>
          <p className="text-meta text-muted">{t('settings.password.description')}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => { reset(); setEditing(true); }}>
          <Icon name="lock" className="h-4 w-4" />
          {t('settings.password.change')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="p-4">
      {error && <FormError message={error} />}
      <Field label={t('settings.password.current')} required className="mb-3">
        <Input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
      </Field>
      <Field label={t('settings.password.new')} required hint={t('settings.password.newHint')} className="mb-3">
        <Input type="password" value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password" />
      </Field>
      <Field label={t('settings.password.confirm')} required className="mb-3">
        <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={saving}>{t('settings.password.submit')}</Button>
        <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

/** Destructive account deletion, gated behind a confirmation dialog + current password. */
function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { logout } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length === 0) {
      setError(t('settings.danger.passwordRequired'));
      return;
    }
    setDeleting(true);
    setError('');
    try {
      await api.deleteAccount(password);
      // The account (and everything in it — items, locations, borrowing
      // history) no longer exists and the server already cleared the auth
      // cookie; logout() just brings this tab's state in sync and routes
      // back to the sign-in screen.
      await logout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.danger.failed'));
      setDeleting(false);
    }
  };

  return (
    <Dialog title={t('settings.danger.label')} onClose={onClose} size="sm">
      <p className="mb-4 text-body text-ink">
        {t('settings.danger.warning')}
      </p>
      <form onSubmit={confirmDelete}>
        {error && <FormError message={error} />}
        <Field label={t('settings.danger.passwordLabel')} required hint={t('settings.danger.passwordHint')} className="mb-4">
          <Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={deleting} onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="danger" loading={deleting}>{t('settings.danger.confirm')}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Interface language and default currency: independent choices, each saved to the account as soon as it changes. */
function PreferencesEditor() {
  const { user, updateUser } = useAuth();
  const { lang, t, setLanguage } = useI18n();
  const toast = useToast();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);

  if (!user) return null;

  const changeLanguage = async (next: Language) => {
    if (next === lang) return;
    setSavingLanguage(true);
    try {
      const { user: updated } = await api.updatePreferences({ language: next });
      updateUser(updated);
      setLanguage(next);
      // Said in the language that was just chosen.
      toast.success(translate(next, 'settings.language.saved'));
    } catch (err) {
      // The previous language stays: the select is controlled by the active language.
      toast.error(err instanceof ApiError ? err.message : t('settings.language.failed'));
    } finally {
      setSavingLanguage(false);
    }
  };

  const changeCurrency = async (next: Currency) => {
    if (next === user.currency) return;
    setSavingCurrency(true);
    try {
      const { user: updated } = await api.updatePreferences({ currency: next });
      updateUser(updated);
      toast.success(t('settings.currency.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.currency.failed'));
    } finally {
      setSavingCurrency(false);
    }
  };

  return (
    <SettingsGroup title={t('settings.group.preferences')}>
      <div className="p-4">
        <Field label={t('settings.language.label')} hint={t('settings.language.hint')} className="mb-0">
          <Select value={lang} disabled={savingLanguage} onChange={e => changeLanguage(e.target.value as Language)}>
            {LANGUAGES.map(code => (
              <option key={code} value={code}>
                {t(code === 'cs' ? 'common.language.cs' : 'common.language.en')}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="p-4">
        <Field label={t('settings.currency.label')} hint={t('settings.currency.hint')} className="mb-0">
          <Select value={user.currency} disabled={savingCurrency} onChange={e => changeCurrency(e.target.value as Currency)}>
            {CURRENCIES.map(code => (
              <option key={code} value={code}>
                {t(CURRENCY_LABEL_KEYS[code])}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </SettingsGroup>
  );
}

/** "Download my data": fetches the account export and saves it as a JSON file. */
function DataExport() {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // The Android shell cannot save a browser download (see lib/download.ts), so
  // there the button is off and says why, rather than reporting a false success.
  const native = isNativeApp();

  const download = async () => {
    setBusy(true);
    try {
      const data = await api.exportData();
      saveJsonFile(exportFileName(new Date()), data);
      toast.success(t('settings.export.done'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.export.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body font-medium text-ink">{t('settings.export.label')}</p>
        <p className="text-meta text-muted">{native ? t('settings.export.nativeUnavailable') : t('settings.export.description')}</p>
      </div>
      <Button size="sm" loading={busy} disabled={native} onClick={download}>
        {t('settings.export.button')}
      </Button>
    </div>
  );
}

/** "Download as a spreadsheet": the items as a CSV file. */
function CsvExport() {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const native = isNativeApp(); // same limit as the JSON download, see lib/download.ts

  const download = async () => {
    setBusy(true);
    try {
      const text = await api.exportItemsCsv();
      saveTextFile(exportCsvFileName(new Date()), text, 'text/csv;charset=utf-8');
      toast.success(t('settings.export.done'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('settings.export.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-body font-medium text-ink">{t('settings.export.csvLabel')}</p>
        <p className="text-meta text-muted">{native ? t('settings.export.nativeUnavailable') : t('settings.export.csvDescription')}</p>
      </div>
      <Button size="sm" loading={busy} disabled={native} onClick={download}>
        {t('settings.export.button')}
      </Button>
    </div>
  );
}

/** "Import items": choose a CSV/JSON file, see a dry-run preview, then confirm. Nothing is saved before the confirmation. */
function DataImport() {
  const { t } = useI18n();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setContent(null); setReport(null); setError(null); };

  const onFile = async (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = ''; // allow choosing the same file again
    if (!file) return;
    reset();
    setBusy(true);
    try {
      let text: string;
      try {
        text = await file.text();
      } catch {
        setError(t('settings.import.readFailed'));
        return;
      }
      const preview = await api.importItems(text, true);
      setContent(text);
      setReport(preview);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (content === null) return;
    setBusy(true);
    try {
      const done = await api.importItems(content, false);
      toast.success(t('settings.import.done', { imported: done.imported }));
      reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settings.import.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-body font-medium text-ink">{t('settings.import.label')}</p>
          <p className="text-meta text-muted">{t('settings.import.description')}</p>
        </div>
        <Button size="sm" loading={busy && report === null} disabled={busy} onClick={() => inputRef.current?.click()}>
          {t('settings.import.choose')}
        </Button>
        <input ref={inputRef} type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={e => void onFile(e.target.files?.[0])} />
      </div>

      {error && <FormError message={error} />}

      {report && (
        <div className="rounded-md border border-line p-3">
          <p className="text-body font-medium text-ink">{t('settings.import.previewTitle')}</p>
          <p className="mt-1 text-meta text-muted">
            {t('settings.import.summary', {
              imported: report.imported, rejected: report.rejected,
              duplicates: report.skippedDuplicates, archived: report.skippedArchived,
            })}
          </p>
          {report.locationsCreated > 0 && (
            <p className="text-meta text-muted">{t('settings.import.newPlaces', { count: report.locationsCreated })}</p>
          )}
          {report.problems.length > 0 && (
            <ul className="mt-2 max-h-40 list-disc overflow-auto pl-5 text-meta text-muted">
              {report.problems.slice(0, 20).map((p, i) => (
                <li key={i}>#{p.row}: {p.message}</li>
              ))}
            </ul>
          )}
          {report.problems.length > 20 && <p className="mt-1 text-meta text-muted">{t('settings.import.moreProblems')}</p>}
          {report.imported === 0 && <p className="mt-2 text-meta text-muted">{t('settings.import.noneToAdd')}</p>}
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={busy} disabled={report.imported === 0} onClick={() => void confirm()}>
              {t('settings.import.confirm', { imported: report.imported })}
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={reset}>{t('settings.import.cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings() {
  const { logout } = useAuth();
  const { preference, resolved, setPreference } = useTheme();
  const toast = useToast();
  const { t } = useI18n();
  const [signingOut, setSigningOut] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
    } catch {
      toast.error(t('settings.signOut.failed'));
      setSigningOut(false);
    }
  };

  const themeLabels: Record<ThemePreference, string> = {
    light: t('settings.theme.light'),
    dark: t('settings.theme.dark'),
    system: t('settings.theme.system'),
  };
  const themeOptions = THEME_ICONS.map(o => ({ ...o, label: themeLabels[o.value] }));
  const themeNote =
    preference === 'system'
      ? resolved === 'dark'
        ? t('settings.theme.followingDark')
        : t('settings.theme.followingLight')
      : preference === 'dark'
        ? t('settings.theme.alwaysDark')
        : t('settings.theme.alwaysLight');

  return (
    <div className="max-w-2xl">
      <PageHeader title={t('settings.title')} />

      <SettingsGroup title={t('settings.group.account')}>
        <AvatarEditor />
        <NameEditor />
        <EmailEditor />
        <PasswordEditor />
        <div className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-body font-medium text-ink">{t('settings.signOut.label')}</p>
            <p className="text-meta text-muted">{t('settings.signOut.description')}</p>
          </div>
          <Button variant="danger" size="sm" loading={signingOut} onClick={signOut}>
            <Icon name="logout" className="h-4 w-4" />
            {t('settings.signOut.label')}
          </Button>
        </div>
      </SettingsGroup>

      <SettingsGroup title={t('settings.group.appearance')}>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-body font-medium text-ink">{t('settings.theme.label')}</p>
            <p className="text-meta text-muted">
              {themeNote}
            </p>
          </div>
          <SegmentedControl<ThemePreference> label={t('settings.theme.label')} value={preference} onChange={setPreference} options={themeOptions} />
        </div>
      </SettingsGroup>

      <PreferencesEditor />

      <SettingsGroup title={t('settings.group.notifications')}>
        <ReminderEmailSetting />
        <CalendarFeedSetting />
      </SettingsGroup>

      <SettingsGroup title={t('settings.group.data')}>
        <DataExport />
        <CsvExport />
        <DataImport />
      </SettingsGroup>

      <SettingsGroup title={t('settings.group.feedback')}>
        <FeedbackSettings />
      </SettingsGroup>

      <section className="mb-6">
        <h2 className="mb-2 px-1 text-caption font-medium uppercase tracking-wide text-muted">{t('settings.group.danger')}</h2>
        <Card className="divide-y divide-line border-danger/30">
          <div className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="text-body font-medium text-ink">{t('settings.danger.label')}</p>
              <p className="text-meta text-muted">{t('settings.danger.description')}</p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
              <Icon name="trash" className="h-4 w-4" />
              {t('settings.danger.button')}
            </Button>
          </div>
        </Card>
      </section>

      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} />}

      <p className="px-1 text-meta text-muted">
        Kepo · {t('common.tagline')} · <Link to="/privacy" className="hover:underline">{t('privacy.link')}</Link> · <Link to="/terms" className="hover:underline">{t('terms.link')}</Link>
      </p>
    </div>
  );
}
