import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { ApiError, useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { AuthShell } from './AuthShell';
import { Button, buttonClass } from '../components/ui/Button';
import { Field, FormError, Input } from '../components/ui/Field';

/** Landing page of the emailed reset link: /reset-password?token=… */
export function ResetPassword() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [params] = useSearchParams();
  // Keep the token in memory only, and take it out of the address bar and
  // history straight away so it is not left behind in the URL.
  const [token] = useState(() => {
    const value = params.get('token') ?? '';
    if (value) window.history.replaceState(window.history.state, '', window.location.pathname);
    return value;
  });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(token === '');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError(t('auth.reset.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      // Every session ended with the change; drop any local one too.
      await logout();
      toast.success(t('auth.reset.success'));
      navigate('/login', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'reset_token_invalid') setInvalid(true);
      else setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (invalid) {
    return (
      <AuthShell title={t('auth.reset.invalidTitle')} subtitle={t('auth.reset.invalidBody')}>
        <Link to="/forgot-password" className={buttonClass('primary', 'md', 'w-full')}>
          {t('auth.reset.requestNew')}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')}>
      <form onSubmit={submit}>
        {error && <FormError message={error} />}
        <Field label={t('auth.field.newPassword')} hint={t('auth.register.passwordHint')}>
          <Input required autoFocus type="password" minLength={8} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <Field label={t('auth.field.confirmPassword')} className="mb-6">
          <Input required type="password" minLength={8} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? t('auth.reset.submitting') : t('auth.reset.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
