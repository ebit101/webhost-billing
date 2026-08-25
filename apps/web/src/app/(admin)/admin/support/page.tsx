import type { Metadata } from 'next';
import { AdminTicketManager } from '../../../../components/support/admin-ticket-manager';
export const metadata: Metadata = { title: 'Support' };
export default function Page() {
  return <AdminTicketManager />;
}
