import Link from 'next/link';

export const domainWorkspaceTabs = [
  { href: '/admin/domains', label: 'Domains' },
  { href: '/admin/domain-pricing', label: 'Domain pricing and TLDs' },
  { href: '/admin/settings/registrars', label: 'Domain registrars' },
] as const;

export function DomainWorkspaceTabs({
  active,
}: {
  active: (typeof domainWorkspaceTabs)[number]['href'];
}) {
  return (
    <nav
      aria-label="Domain workspace"
      className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
    >
      {domainWorkspaceTabs.map(({ href, label }) => (
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
