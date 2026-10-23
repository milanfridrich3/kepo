import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { ApiError } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { AuthShell } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Field, FormError, Input } from '../components/ui/Field';

export function ForgotPassword() {
  const { t, rich } = useI18n();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      // Same confirmation whether or not an account exists: the server does not say.
      setSentTo(email.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link to="/login" className="font-medium text-accent-ink hover:underline">
      {t('auth.forgot.back')}
    </Link>
  );

  if (sentTo !== null) {
    return (
      <AuthShell
        title={t('auth.forgot.sentTitle')}
        subtitle={rich('auth.forgot.sentBody', { email: sentTo }, { b: text => <strong className="font-medium text-ink break-words">{text}</strong> })}
        footer={back}
      >
        <Button type="button" variant="secondary" className="w-full" onClick={() => setSentTo(null)}>
          {t('auth.forgot.tryAgain')}
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} footer={back}>
      <form onSubmit={submit}>
        {error && <FormError message={error} />}
        <Field label={t('auth.field.email')} className="mb-6">
          <Input required type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? t('auth.forgot.submitting') : t('auth.forgot.submit')}
        </Button>
      </form>
    </AuthShell>
  );
}
