'use client';
import { domainDetailSchema } from '@webhost-billing/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { authenticatedGet } from '../../lib/auth-api';
import { clientRecordHref } from '../../lib/client-record-href';
import { ErrorState, LoadingState } from '../ui/feedback-state';
export function DomainOwnerRedirect({ domainId }: { domainId: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      domainDetailSchema.shape.id.parse(domainId);
      const domain = domainDetailSchema.parse(
        await authenticatedGet('/domains/' + domainId),
      );
      if (
        domain.id.toLowerCase() !== domainId.toLowerCase() ||
        !domain.customerId
      )
        throw new Error('Domain client context is unavailable.');
      if (active)
        router.replace(
          clientRecordHref(domain.customerId, 'domains', domain.id),
        );
    })().catch(() => {
      if (active) setError('The domain could not be opened.');
    });
    return () => {
      active = false;
    };
  }, [domainId, router]);
  return error ? <ErrorState description={error} /> : <LoadingState />;
}
