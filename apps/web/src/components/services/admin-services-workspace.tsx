'use client';

import { useCallback, useState } from 'react';
import type { AdminCustomerFilter } from '../../lib/admin-customer-filter';
import { AdminHostingOperationManager } from './admin-hosting-operation-manager';
import { AdminServiceManager } from './admin-service-manager';

export function AdminServicesWorkspace({
  customerFilter,
}: {
  customerFilter: AdminCustomerFilter;
}) {
  const [panel, setPanel] = useState({ revision: 0, pending: 0 });
  const onMutationStateChange = useCallback((begun: boolean) => {
    setPanel((current) => ({
      revision: current.revision + (begun ? 1 : 0),
      pending: Math.max(0, current.pending + (begun ? 1 : -1)),
    }));
  }, []);

  return (
    <div className="grid gap-8">
      <AdminServiceManager
        customerFilter={customerFilter}
        reviewRevision={panel.revision}
        inspectionBlocked={panel.pending > 0}
      />
      <AdminHostingOperationManager
        onMutationStateChange={onMutationStateChange}
      />
    </div>
  );
}
