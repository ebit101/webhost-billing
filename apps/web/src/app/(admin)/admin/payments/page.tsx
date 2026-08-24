import type { Metadata } from 'next';
import { AdminPaymentManager } from '../../../../components/payments/admin-payment-manager';
export const metadata: Metadata = { title: 'Payments' };
export default function Page() {
  return <AdminPaymentManager />;
}
