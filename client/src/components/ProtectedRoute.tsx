import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { KepoMark } from './ui/Logo';
import { Spinner } from './ui/Button';

/** Full-screen placeholder shown while the first session check is in flight. */
export function LoadingScreen() {
  const { t } = useI18n();
  return (
    <div role="status" aria-label={t('ui.loading')} className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas">
      <KepoMark className="h-8 w-8" />
      <Spinner className="h-4 w-4 text-muted" />
    </div>
  );
}

/**
 * Signed-out visitors go to the sign-in page. A signed-in account whose email is
 * not confirmed yet is held on the verification screen: the server refuses its
 * data requests anyway (requireVerified), this just avoids a page full of errors.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify-email" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
