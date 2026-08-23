'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { authMutation } from '../../lib/auth-api';
import { FormNotice } from './form-controls';

export function VerifyEmailPanel({ token }: { token?: string }) {
  const [error, setError] = useState<string | undefined>(
    token ? undefined : 'This verification link is incomplete.',
  );
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!token) {
      return;
    }

    let active = true;
    void authMutation<{ message: string }>('/auth/verify-email', 'POST', {
      token,
    })
      .then((result) => {
        if (active) setMessage(result.message);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : 'Verification failed.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="grid gap-5">
      {!error && !message ? (
        <p className="text-sm text-slate-600">Verifying your email…</p>
      ) : null}
      <FormNotice error={error} message={message} />
      {message ? (
        <Link
          href="/login"
          className="font-medium text-cyan-700 hover:underline"
        >
          Continue to sign in
        </Link>
      ) : null}
    </div>
  );
}
