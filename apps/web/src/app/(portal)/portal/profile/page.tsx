import type { Metadata } from 'next';
import { CustomerProfile } from '../../../../components/customers/customer-profile';
export const metadata: Metadata = { title: 'Profile and security' };
export default function ProfilePage() {
  return <CustomerProfile />;
}
