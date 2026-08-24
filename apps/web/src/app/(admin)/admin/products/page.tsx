import type { Metadata } from 'next';
import { AdminProductManager } from '../../../../components/products/admin-product-manager';
export const metadata: Metadata = { title: 'Products' };
export default function Page() {
  return <AdminProductManager />;
}
