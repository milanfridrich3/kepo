import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { VerificationInfo } from '../types';
import { useAuth, ApiError } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useToast } from '../context/ToastContext';
import { LoadingScreen } from '../components/ProtectedRoute';
import { AuthShell } from './AuthShell';
import { Button } from '../components/ui/Button';
import { Field, FormError, Input } from '../components/ui/Field';

/**
 * Where an account lands until its email address is confirmed with the
 * 6-digit code. The server enforces everything (expiry, attempt limit, resend
 * cooldown); this screen just displays it.
 */
export function VerifyEmail() {
  const { user, loading, updateUser, logout } = useAuth();
  const { t, rich } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const initial = (location.state as { verification?: VerificationInfo } | null)?.verification;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    initial && initial.required && !initial.emailSent ? t('auth.verify.notSent') : null
  );
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(initial?.retryAfterSeconds ?? 0);

  // The registration result is only a hint for the first view: drop it from the
  // history entry so a reload does not restart the countdown from stale data.
  useEffect(() => {
    if (initial) window.history.replaceState({ ...window.history.state, usr: null }, '');
  }, [initial]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(c => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified && !busy) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const clean = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setError(t('auth.verify.codeInvalid'));
      return;
    }
    setBusy(true);
    try {
      const { user: verified } = await api.verifyEmail(clean);
      updateUser(verified);
      toast.success(t('auth.verify.done'));
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const { retryAfterSeconds } = await api.resendVerification();
      setCooldown(retryAfterSeconds);
      setCode('');
      setNotice(t('auth.verify.sent'));
    } catch (err) {
      if (err instanceof ApiError && err.retryAfterSeconds) setCooldown(err.retryAfterSeconds);
      setError(err instanceof ApiError ? err.message : t('error.generic'));
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell
      title={t('auth.verify.title')}
      subtitle={rich('auth.verify.subtitle', { email: user.email }, { b: text => <strong className="font-medium text-ink break-words">{text}</strong> })}
      footer={
        <button type="button" onClick={() => void logout()} className="font-medium text-accent-ink hover:underline">
          {t('auth.verify.signOut')}
        </button>
      }
    >
      <form onSubmit={submit} noValidate>
        {error && <FormError message={error} />}
        {notice && !error && (
          <p role="status" className="mb-4 rounded-control bg-sunken px-3 py-2.5 text-meta text-muted">
            {notice}
          </p>
        )}
        <Field label={t('auth.verify.codeLabel')} hint={t('auth.verify.spam')} className="mb-6">
          <Input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))}
            className="text-center font-mono text-lg tracking-[0.4em]"
          />
        </Field>
        <Button type="submit" variant="primary" loading={busy} className="w-full">
          {busy ? t('auth.verify.submitting') : t('auth.verify.submit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="mt-2 w-full"
          disabled={cooldown > 0 || resending}
          onClick={() => void resend()}
        >
          {resending ? t('auth.verify.resending') : cooldown > 0 ? t('auth.verify.resendIn', { seconds: cooldown }) : t('auth.verify.resend')}
        </Button>
      </form>
    </AuthShell>
  );
}
