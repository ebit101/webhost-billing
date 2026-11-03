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
  useEffect(() => {
    let pending: AbortController | undefined;
    function load() {
      pending?.abort();
      const request = new AbortController();
      pending = request;
      void fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/settings/public-preferences`,
        { signal: request.signal, cache: 'no-store' },
      )
        .then(async (response) => {
          if (!response.ok) return;
          const body: unknown = await response.json();
          const parsed = apiSuccessResponseSchema(
            publicPreferencesSchema,
          ).safeParse(body);
          if (parsed.success && !request.signal.aborted)
            setPreferences(parsed.data.data);
        })
        .catch(() => {
          /* Keep the last valid preferences when unavailable. */
        });
    }
    load();
    window.addEventListener(changeEvent, load);
    return () => {
      pending?.abort();
      window.removeEventListener(changeEvent, load);
    };
  }, []);
  return <Context.Provider value={preferences}>{children}</Context.Provider>;
}

export function usePublicPreferences() {
  return useContext(Context);
}
