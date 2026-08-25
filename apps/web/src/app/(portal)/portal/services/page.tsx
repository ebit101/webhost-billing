import type { Metadata } from 'next';
import { CustomerServiceList } from '../../../../components/services/customer-service-list';
export const metadata: Metadata = { title: 'My services' };
export default function ServicesPage() {
  return <CustomerServiceList />;
}
