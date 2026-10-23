import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ApiError } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { AuthShell } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Field, FormError, Input } from '../components/ui/Field';

export function Login() {
  const { user, loading, login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <AuthShell
      title={t('auth.login.title')}
      subtitle={t('auth.login.subtitle')}
      footer={
        <>
          {t('auth.login.footer')}{' '}
          <Link to="/register" className="font-medium text-accent-ink hover:underline">
            {t('auth.login.createAccount')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <FormError message={error} />}
        <Field label={t('auth.field.email')}>
          <Input required type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.field.password')} className="mb-2">
          <Input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <p className="mb-6 text-right text-meta">
          <Link to="/forgot-password" className="font-medium text-accent-ink hover:underline">
            {t('auth.login.forgot')}
          </Link>
        </p>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? t('auth.login.submitting') : t('auth.login.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
