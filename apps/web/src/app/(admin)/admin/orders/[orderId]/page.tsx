import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AdminOrderReview } from '../../../../../components/orders/admin-order-review';
import {
  adminOrderHref,
  readAdminOrderQuery,
} from '../../../../../lib/admin-order-ledger-query';

export const metadata: Metadata = { title: 'Order details' };

export default async function Page({
  params,
  searchParams,
}: PageProps<'/admin/orders/[orderId]'>) {
  const [{ orderId }, search] = await Promise.all([params, searchParams]);
  const { query, invalid, customerFilter } = readAdminOrderQuery(search);
  if (customerFilter.invalid) notFound();
  return (
    <AdminOrderReview
      orderId={orderId}
      customerId={customerFilter.customerId}
      backHref={
        invalid || !Object.keys(search).length
          ? '/admin/orders'
          : adminOrderHref(query)
      }
    />
  );
}
