'use client';

import { RecordDialog } from './record-dialog';
import { Button } from './button';
import { Icon } from './icon';

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <RecordDialog
      open={open}
      title={title}
      role="alertdialog"
      busy={busy}
      onClose={onClose}
    >
      <section className="grid gap-4">
        <div className="flex items-start gap-4">
          <span
            className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
              destructive
                ? 'bg-red-50 text-red-700'
                : 'bg-brand-50 text-brand-700'
            }`}
          >
            <Icon name={destructive ? 'alert' : 'shield'} className="size-5" />
          </span>
          <div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {description}
            </p>
          </div>
        </div>
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            data-record-autofocus
            variant={destructive ? 'danger' : 'primary'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </section>
    </RecordDialog>
  );
}
