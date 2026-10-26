'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from './button';

const scrollLocks = new WeakMap<
  HTMLElement,
  { count: number; overflow: string }
>();

function lockScrolling(body: HTMLElement) {
  const lock = scrollLocks.get(body) ?? {
    count: 0,
    overflow: body.style.overflow,
  };
  scrollLocks.set(body, lock);
  lock.count += 1;
  body.style.overflow = 'hidden';
  return () => {
    lock.count -= 1;
    if (lock.count === 0) {
      body.style.overflow = lock.overflow;
      scrollLocks.delete(body);
    }
  };
}

/** Keeps form drafts mounted while the browser isolates the active record. */
export function RecordDialog({
  open,
  title,
  onClose,
  busy = false,
  feedback,
  children,
  role = 'dialog',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  busy?: boolean;
  feedback?: string;
  children: ReactNode;
  role?: 'dialog' | 'alertdialog';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const latest = useRef({ busy, onClose });
  useEffect(() => {
    latest.current = { busy, onClose };
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement;
    const unlockScrolling = lockScrolling(document.body);
    dialog.showModal();
    (
      dialog.querySelector<HTMLElement>('[data-record-autofocus]') ??
      dialog.querySelector<HTMLElement>('h2[tabindex="-1"]')
    )?.focus();
    return () => {
      dialog.close();
      unlockScrolling();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!latest.current.busy) latest.current.onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          if (!latest.current.busy) latest.current.onClose();
        }
        if (event.key === 'Tab') {
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
            ),
          ).filter(
            (element) =>
              element.closest('dialog') === ref.current &&
              !element.closest('[hidden]'),
          );
          const first = focusable[0],
            last = focusable[focusable.length - 1];
          if (
            first &&
            last &&
            ((event.shiftKey && document.activeElement === first) ||
              (!event.shiftKey && document.activeElement === last))
          ) {
            event.preventDefault();
            event.stopPropagation();
            (event.shiftKey ? last : first).focus();
          }
        }
      }}
      className={
        'fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100vw_-_2rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/60 ' +
        (role === 'alertdialog' ? 'max-w-lg' : 'max-w-5xl')
      }
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4">
        <h2 id={titleId} className="min-w-0 break-words text-lg font-bold">
          {title}
        </h2>
        {role === 'dialog' ? (
          <Button
            type="button"
            variant="secondary"
            className="shrink-0"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </Button>
        ) : null}
      </header>
      <div className="grid min-w-0 grid-cols-1 gap-5 break-words p-5 [&>*]:min-w-0">
        {open && feedback ? (
          <p aria-live="polite" className="rounded-xl bg-slate-100 p-3 text-sm">
            {feedback}
          </p>
        ) : null}
        {children}
      </div>
    </dialog>
  );
}

export function RecordAction({
  label,
  title = label,
  children,
  busy = false,
  feedback,
  initialOpen = false,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  busy?: boolean;
  feedback?: string;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <RecordDialog
        open={open}
        title={title}
        onClose={() => setOpen(false)}
        busy={busy}
        feedback={feedback}
      >
        {children}
      </RecordDialog>
    </div>
  );
}
