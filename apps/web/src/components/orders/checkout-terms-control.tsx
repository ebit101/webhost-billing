'use client';

import { useState } from 'react';
import {
  refreshPublicPreferences,
  usePublicPreferences,
  usePublicPreferencesStatus,
} from '../../lib/public-preferences';

export function useCheckoutTerms() {
  const policy = usePublicPreferences().checkoutTerms;
  const status = usePublicPreferencesStatus();
  const [checkedVersion, setCheckedVersion] = useState<string>();
  const acceptedTermsVersion =
    policy?.required && checkedVersion === policy.version
      ? policy.version
      : undefined;
  return {
    policy,
    status,
    acceptedTermsVersion,
    blocked:
      status !== 'ready' || Boolean(policy?.required && !acceptedTermsVersion),
    setAccepted: (checked: boolean) =>
      setCheckedVersion(
        checked && policy?.required ? policy.version : undefined,
      ),
  };
}

export function CheckoutTermsControl({
  terms,
  busy,
}: {
  terms: ReturnType<typeof useCheckoutTerms>;
  busy: boolean;
}) {
  if (terms.status === 'loading')
    return <p className="text-sm text-slate-600">Loading checkout terms…</p>;
  if (terms.status === 'unavailable')
    return (
      <p role="alert" className="text-sm text-red-700">
        Checkout terms could not be loaded.{' '}
        <button
          type="button"
          className="underline"
          onClick={refreshPublicPreferences}
        >
          Try again
        </button>
      </p>
    );
  if (!terms.policy?.required) return null;
  return (
    <div className="space-y-1 text-sm">
      <a
        href={terms.policy.url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-semibold text-brand-700 underline"
      >
        Read the terms of service
      </a>
      <p className="text-slate-600">Version {terms.policy.revision}</p>
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={Boolean(terms.acceptedTermsVersion)}
          disabled={busy}
          onChange={(event) => terms.setAccepted(event.target.checked)}
        />
        I accept the terms of service
      </label>
    </div>
  );
}
