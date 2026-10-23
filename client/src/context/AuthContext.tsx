import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import type { Currency, Language, User, VerificationInfo } from '../types';
import { api, ApiError, setSessionInvalidHandler } from '../lib/api';
import { useToast } from './ToastContext';
import { useI18n } from './I18nContext';
import { t } from '../i18n';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** Creates the account in the interface language currently selected. Resolves with what the server did about the verification email. */
  register: (email: string, password: string, name: string, options?: { currency?: Currency }) => Promise<VerificationInfo>;
  /** Always ends the local session, even if the server cannot be reached. */
  logout: () => Promise<void>;
  /** Pushes a freshly-saved user (from a profile/email/avatar update) into context, without a refetch or reload. */
  updateUser: (user: User) => void;
}
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const { lang, setLanguage } = useI18n();
  const langRef = useRef<Language>(lang);
  langRef.current = lang;
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const signedIn = useRef(false);
  signedIn.current = user !== null;

  useEffect(() => {
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // The saved account language wins once someone is signed in (it follows
  // them across devices); before that the choice made on the sign-in screen,
  // remembered in this browser, applies.
  useEffect(() => {
    if (user && user.language !== langRef.current) setLanguage(user.language);
  }, [user, setLanguage]);

  // Any request that finds the session invalid (expired, revoked by a
  // password change, account deleted elsewhere) lands here: drop the user,
  // and ProtectedRoute sends the browser to the sign-in page. The very first
  // /me check on a fresh visit also reports "not signed in" — that is not an
  // expiry, so nothing is announced unless someone was actually signed in.
  useEffect(() => {
    setSessionInvalidHandler(() => {
      if (!signedIn.current) return;
      signedIn.current = false;
      setUser(null);
      toast.info(t('error.sessionEnded'));
    });
    return () => setSessionInvalidHandler(null);
  }, [toast]);

  const login = useCallback(async (email: string, password: string) => {
    const { user } = await api.login({ email, password });
    setUser(user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string, options: { currency?: Currency } = {}) => {
    const { user, verification } = await api.register({ email, password, name, language: langRef.current, currency: options.currency });
    setUser(user);
    return verification;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // The server may be unreachable or the session already gone. Either
      // way the person asked to leave, so this device is signed out locally.
    } finally {
      setUser(null);
    }
  }, []);

  const updateUser = useCallback((updated: User) => {
    setUser(updated);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export { ApiError };
