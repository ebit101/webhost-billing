'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  apiSuccessResponseSchema,
  DEFAULT_PUBLIC_PREFERENCES,
  publicPreferencesSchema,
} from '@webhost-billing/shared';

const Context = createContext(DEFAULT_PUBLIC_PREFERENCES);
const LoadContext = createContext<'loading' | 'ready' | 'unavailable'>('ready');
export function usePublicPreferencesStatus() {
  return useContext(LoadContext);
}
const changeEvent = 'webhost-public-preferences-changed';
export function refreshPublicPreferences() {
  window.dispatchEvent(new Event(changeEvent));
}

export function PublicPreferencesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [preferences, setPreferences] = useState(DEFAULT_PUBLIC_PREFERENCES);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading',
  );
  useEffect(() => {
    let pending: AbortController | undefined;
    function load() {
      pending?.abort();
      setStatus('loading');
      const request = new AbortController();
      pending = request;
      void fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/settings/public-preferences`,
        { signal: request.signal, cache: 'no-store' },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const body: unknown = await response.json();
          const parsed = apiSuccessResponseSchema(
            publicPreferencesSchema,
          ).safeParse(body);
          if (request.signal.aborted) return;
          if (!parsed.success) throw new Error();
          setPreferences(parsed.data.data);
          setStatus('ready');
        })
        .catch(() => {
          if (!request.signal.aborted) setStatus('unavailable');
        });
    }
    load();
    window.addEventListener(changeEvent, load);
    return () => {
      pending?.abort();
      window.removeEventListener(changeEvent, load);
    };
  }, []);
  return (
    <Context.Provider value={preferences}>
      <LoadContext.Provider value={status}>{children}</LoadContext.Provider>
    </Context.Provider>
  );
}

export function usePublicPreferences() {
  return useContext(Context);
}
