import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A tiny "something changed" signal. Pages include `version` in their
 * data-loading effect; anything that mutates data (e.g. the global
 * Add item sheet) calls `bump()` so whichever screen is visible refetches
 * from the API. No data is cached here — the API stays the source of truth.
 */
interface DataContextValue {
  version: number;
  bump: () => void;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
