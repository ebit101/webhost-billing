'use client';

import { useEffect, useState } from 'react';
import type { TicketAttachment } from '@webhost-billing/shared';
import { authenticatedFile, authenticatedGet } from '../../lib/auth-api';

export function TicketAttachmentInput({ disabled }: { disabled: boolean }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void authenticatedGet<{ enabled: boolean }>('/tickets/attachment-policy')
      .then((policy) => {
        if (active) setEnabled(policy.enabled === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return (
    <label className="block text-sm font-semibold text-slate-700">
      Attachments (optional)
      <input
        type="file"
        name="attachments"
        multiple
        accept=".png,.jpg,.jpeg,.txt,.log"
        disabled={disabled || !enabled}
        className="mt-2 block max-w-full text-sm"
      />
      <span className="mt-1 block text-xs font-normal text-slate-500">
        {enabled
          ? 'Up to three PNG/JPEG screenshots or UTF-8 text/log files, 2 MiB each. Files must pass malware screening. Do not attach passwords or private keys.'
          : 'Attachments are unavailable until malware screening is configured. You can still send a text message.'}
      </span>
    </label>
  );
}

export function TicketAttachmentDownloads({
  files,
}: {
  files: TicketAttachment[];
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function download(file: TicketAttachment) {
    setBusy(true);
    setError('');
    try {
      const result = await authenticatedFile(
        `/tickets/attachments/${file.id}/download`,
      );
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(
        'The attachment could not be downloaded. It may have expired or your access may have changed.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 space-y-2">
      {files.map((file) => (
        <div key={file.id} className="text-xs">
          <button
            type="button"
            className="break-all font-semibold text-brand-700 underline disabled:text-slate-500"
            disabled={busy || file.status !== 'ATTACHED'}
            onClick={() => void download(file)}
          >
            {file.filename}
          </button>{' '}
          · {Math.ceil(file.sizeBytes / 1024)} KiB
          {file.status !== 'ATTACHED' ? ' · Unavailable or expired' : ''}
        </div>
      ))}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
