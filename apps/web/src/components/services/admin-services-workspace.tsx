'use client';

import { useCallback, useState } from 'react';
import type { AdminCustomerFilter } from '../../lib/admin-customer-filter';
import type { AdminServiceSelection } from '../../lib/admin-service-ledger-query';
import { AdminHostingOperationManager } from './admin-hosting-operation-manager';
import { AdminServiceManager } from './admin-service-manager';

export function AdminServicesWorkspace({
  customerFilter,
  selection,
}: {
  customerFilter?: AdminCustomerFilter;
  selection?: AdminServiceSelection;
}) {
  const [panel, setPanel] = useState({ revision: 0, pending: 0, completed: 0 });
  const onMutationStateChange = useCallback((begun: boolean) => {
    setPanel((current) => ({
      revision: current.revision + (begun ? 1 : 0),
      pending: Math.max(0, current.pending + (begun ? 1 : -1)),
      completed: current.completed + (begun ? 0 : 1),
    }));
  }, []);

  return (
    <div className="grid gap-8">
      <AdminServiceManager
        customerFilter={customerFilter}
        selection={selection}
        inventoryRevision={panel.completed}
        reviewRevision={panel.revision}
        inspectionBlocked={panel.pending > 0}
      />
      <AdminHostingOperationManager
        onMutationStateChange={onMutationStateChange}
      />
    </div>
  );
}
