import type { Metadata } from 'next';
import { CustomerTicketManager } from '../../../../components/support/customer-ticket-manager';
export const metadata: Metadata = { title: 'Support' };
export default function SupportPage() {
  return <CustomerTicketManager />;
}
