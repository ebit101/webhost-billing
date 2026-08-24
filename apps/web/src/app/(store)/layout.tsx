import type { ReactNode } from 'react';
import { PublicFooter } from '../../components/layout/public-footer';
import { PublicHeader } from '../../components/layout/public-header';

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <PublicHeader />
      {children}
      <PublicFooter />
    </div>
  );
}
