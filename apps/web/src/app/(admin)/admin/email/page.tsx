import type { Metadata } from 'next';
import { EmailDeliveryManager } from '../../../../components/email/email-delivery-manager';

export const metadata: Metadata = { title: 'Email delivery' };

export default function Page() {
  return <EmailDeliveryManager />;
}
