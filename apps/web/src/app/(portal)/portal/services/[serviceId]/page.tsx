import type { Metadata } from 'next';
import { CustomerServiceDetail } from '../../../../../components/services/customer-service-detail';

export const metadata: Metadata = { title: 'Service details' };

export default async function Page({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  return <CustomerServiceDetail serviceId={serviceId} />;
}
