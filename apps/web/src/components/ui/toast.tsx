'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from './icon';

type ToastTone = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<ToastItem, 'id'>) => {
      const id = ++nextId.current;
      setToasts((current) => [...current.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), 5_000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-3 sm:left-auto sm:w-96"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((toast) => (
          <article
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/15"
          >
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-xl ${
                toast.tone === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : toast.tone === 'error'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-brand-50 text-brand-700'
              }`}
            >
              <Icon
                name={toast.tone === 'error' ? 'alert' : 'check'}
                className="size-4"
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-950">{toast.title}</p>
              {toast.description ? (
                <p className="mt-1 text-sm leading-5 text-slate-600">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <span className="sr-only">Dismiss notification</span>
              <Icon name="close" className="size-4" />
            </button>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return value;
}
