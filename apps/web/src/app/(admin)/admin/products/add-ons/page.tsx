import type { Metadata } from 'next';
import { AdminHostingAddOns } from '../../../../../components/products/admin-hosting-add-ons';

export const metadata: Metadata = { title: 'Product add-ons' };

export default function Page() {
  return <AdminHostingAddOns />;
}
