import type { Metadata } from 'next';
import { CustomerOrderList } from '../../../../components/orders/customer-order-list';
import { readCustomerOrderQuery } from '../../../../lib/customer-order-ledger-query';

export const metadata: Metadata = { title: 'My orders' };

export default async function Page({
  searchParams,
}: PageProps<'/portal/orders'>) {
  return (
    <CustomerOrderList selection={readCustomerOrderQuery(await searchParams)} />
  );
}
