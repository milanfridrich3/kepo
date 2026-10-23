import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ApiError } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { AuthShell } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Field, FormError, Input } from '../components/ui/Field';

export function Register() {
  const { user, loading, register } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // The account starts in the language selected on this screen (with that
      // language's default currency, chosen by the server).
      const verification = await register(email, password, name);
      navigate(verification.required ? '/verify-email' : '/', { state: { verification } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  if (!loading && user && !busy) return <Navigate to="/" replace />;

  return (
    <AuthShell
      title={t('auth.register.title')}
      subtitle={t('auth.register.subtitle')}
      footer={
        <>
          {t('auth.register.footer')}{' '}
          <Link to="/login" className="font-medium text-accent-ink hover:underline">
            {t('auth.register.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        {error && <FormError message={error} />}
        <Field label={t('auth.field.name')}>
          <Input required autoComplete="name" autoFocus maxLength={120} value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field label={t('auth.field.email')}>
          <Input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        <Field label={t('auth.field.password')} hint={t('auth.register.passwordHint')} className="mb-6">
          <Input
            required
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </Field>
        <p className="mb-4 text-caption text-muted">
          {t('auth.register.legal.before')}{' '}
          <Link to="/privacy" target="_blank" className="font-medium text-accent-ink hover:underline">{t('auth.register.legal.privacy')}</Link>{' '}
          {t('auth.register.legal.and')}{' '}
          <Link to="/terms" target="_blank" className="font-medium text-accent-ink hover:underline">{t('auth.register.legal.terms')}</Link>.
        </p>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? t('auth.register.submitting') : t('auth.register.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
