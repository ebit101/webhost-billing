import type { StaffRole } from '@webhost-billing/shared';
import Link from 'next/link';
import { canAccessAdminPath } from '../../lib/admin-access';

export const billingWorkspaceTabs = [
  { href: '/admin/invoices', label: 'Invoices' },
  { href: '/admin/payments', label: 'Transactions' },
] as const;

export function BillingWorkspaceTabs({
  active,
  staffRole,
}: {
  active: (typeof billingWorkspaceTabs)[number]['href'];
  staffRole: StaffRole;
}) {
  return (
    <nav
      aria-label="Billing workspace"
      className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
    >
      {billingWorkspaceTabs
        .filter(({ href }) => canAccessAdminPath(staffRole, href))
        .map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 ${active === href ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            {label}
          </Link>
        ))}
    </nav>
  );
}
