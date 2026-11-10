'use client';

import {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import type {AccountState} from '../lib/account';

type AccountContextValue = AccountState & {loading: boolean; error: string; reload(): Promise<void>; logout(): Promise<void>};
const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({children}: {children: React.ReactNode}) {
  const [state, setState] = useState<AccountState>({configured: false, user: null});
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const token = ++generation.current;
    try {
      const response = await fetch('/api/account', {cache: 'no-store', signal: AbortSignal.timeout(20000)});
      const data = await response.json() as AccountState;
      if (!response.ok || typeof data.configured !== 'boolean') throw Error();
      if (token === generation.current) {setState(data); setError('');}
    } catch {if (token === generation.current) {setState(old => ({...old, user: null})); setError('No se pudo cargar tu cuenta.');}}
    finally {if (token === generation.current) setLoading(false);}
  }, []);
  useEffect(() => {
    void reload();
    const visible = () => {if (!document.hidden) void reload();};
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    return () => {generation.current++; window.removeEventListener('focus', visible); document.removeEventListener('visibilitychange', visible);};
  }, [reload]);
  const logout = useCallback(async () => {
    const response = await fetch('/api/auth/logout', {method: 'POST'});
    if (!response.ok) throw Error('No se pudo cerrar la sesión. Inténtalo de nuevo.');
    generation.current++; setState(old => ({...old, user: null})); setError('');
  }, []);
  return <AccountContext.Provider value={{...state, loading, error, reload, logout}}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const context = useContext(AccountContext);
  if (!context) throw Error('AccountProvider is required.');
  return context;
}
