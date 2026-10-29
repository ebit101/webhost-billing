'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  domainDetailSchema,
  existingDomainLinkRequestSchema,
  registrarConnectionListSchema,
  type RegistrarConnection,
} from '@webhost-billing/shared';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
import { Button } from '../ui/button';
import { RecordDialog } from '../ui/record-dialog';
import { fieldClass } from '../customers/customer-fields';
import { Field } from './domain-fields';

export function ExistingDomainLink({
  customerId,
  onLinked,
}: {
  customerId: string;
  onLinked: (domainId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<RegistrarConnection[]>([]);
  const [domainName, setDomainName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const submission = useRef<{ signature: string; key: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    let active = true;
    void authenticatedGet('/domains/administration/registrars')
      .then((data) => {
        if (active)
          setAccounts(
            registrarConnectionListSchema
              .parse(data)
              .filter((account) => account.mode === 'Live'),
          );
      })
      .catch(() => {
        if (active)
          setNotice(
            'Registrar connections could not be loaded. Close and try again.',
          );
      });
    return () => {
      active = false;
    };
  }, [open]);
  const selected = accounts.find((account) => account.id === accountId);
  const ready = !!selected?.enabled && selected.networkEnabled;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !ready) return;
    const signature = JSON.stringify([
      customerId,
      accountId,
      domainName.trim().toLowerCase(),
    ]);
    if (submission.current?.signature !== signature)
      submission.current = { signature, key: crypto.randomUUID() };
    const parsed = existingDomainLinkRequestSchema.safeParse({
      customerId,
      registrarAccountId: accountId,
      domainName,
      confirmation,
      submissionKey: submission.current.key,
    });
    if (!parsed.success) {
      setNotice(
        'Enter an ordinary .com domain and type the same domain to confirm.',
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setNotice('');
    try {
      const result = domainDetailSchema.parse(
        await authMutation('/domains/existing-links', 'POST', parsed.data),
      );
      if (
        result.origin !== 'EXISTING' ||
        result.customerId !== customerId ||
        result.accountId !== accountId ||
        result.domainName !== parsed.data.domainName
      )
        throw new Error(
          'The returned domain link does not match this client. Refresh saved records before retrying.',
        );
      setNotice(
        'Existing domain linked. No registration, purchase, order or invoice was created.',
      );
      onLinked(result.id);
      setOpen(false);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'The link could not be confirmed. Retry the same request or refresh saved records.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Link existing domain
      </Button>
      <RecordDialog
        open={open}
        title="Link existing domain"
        busy={busy}
        feedback={notice}
        onClose={() => setOpen(false)}
      >
        <p className="text-sm">
          Link an already registered ordinary .com domain to this client. The
          selected registrar must prove active ownership. This does not
          register, transfer or purchase a domain, create contacts, change
          nameservers or create billing records.
        </p>
        <form
          onSubmit={(event) => void submit(event)}
          className="grid gap-4 sm:grid-cols-2"
        >
          <Field label="Existing domain">
            <input
              required
              name="domainName"
              className={fieldClass}
              value={domainName}
              onChange={(event) => setDomainName(event.target.value)}
              placeholder="example.com"
              disabled={busy}
            />
          </Field>
          <Field label="Registrar connection">
            <select
              required
              className={fieldClass}
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              disabled={busy}
            >
              <option value="">Select registrar connection</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {!account.enabled || !account.networkEnabled
                    ? ' · Disabled'
                    : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type exact domain name">
            <input
              required
              className={fieldClass}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
            />
          </Field>
          {!ready && (
            <p role="status" className="text-sm">
              Verification is unavailable until the selected connection and
              registrar networking are enabled separately. This form does not
              enable providers.
            </p>
          )}
          <Button type="submit" disabled={busy || !ready}>
            Verify ownership and link domain
          </Button>
        </form>
      </RecordDialog>
    </>
  );
}
