import type { Metadata } from 'next';
import { CustomerServiceList } from '../../../../components/services/customer-service-list';
import { readCustomerServiceQuery } from '../../../../lib/customer-service-ledger-query';

export const metadata: Metadata = { title: 'My services' };

export default async function ServicesPage({
  searchParams,
}: PageProps<'/portal/services'>) {
  return (
    <CustomerServiceList
      selection={readCustomerServiceQuery(await searchParams)}
    />
  );
}
