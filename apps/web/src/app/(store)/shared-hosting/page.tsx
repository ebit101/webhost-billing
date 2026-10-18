import type { Metadata } from 'next';
import { HostingLanding } from '../../../components/products/hosting-landing';

export const metadata: Metadata = { title: 'Shared hosting plans' };

export default function SharedHostingPage() {
  return <HostingLanding />;
}
