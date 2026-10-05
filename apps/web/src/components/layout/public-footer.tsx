import Link from 'next/link';
import { Brand } from './brand';
import { getWebBranding } from '../../lib/web-branding';

export function PublicFooter() {
  const branding = getWebBranding();
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <Brand />
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
            {branding.tagline ??
              'Straightforward hosting and billing for one focused local hosting team.'}
          </p>
          {branding.contactEmail ||
          branding.contactPhone ||
          branding.contactAddress ||
          branding.website ? (
            <address
              className="mt-4 grid max-w-sm gap-2 text-sm not-italic leading-6 text-slate-600"
              aria-label="Business contact information"
            >
              {branding.contactEmail ? (
                <a
                  className="footer-link break-all"
                  href={`mailto:${branding.contactEmail}`}
                >
                  {branding.contactEmail}
                </a>
              ) : null}
              {branding.contactPhone ? (
                <a
                  className="footer-link"
                  href={`tel:${branding.contactPhone}`}
                >
                  {branding.contactPhone}
                </a>
              ) : null}
              {branding.contactAddress ? (
                <span>{branding.contactAddress}</span>
              ) : null}
              {branding.website ? (
                <a className="footer-link break-all" href={branding.website}>
                  Business website
                </a>
              ) : null}
            </address>
          ) : null}
        </div>
        <nav
          aria-label="Footer navigation"
          className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm"
        >
          <Link href="/hosting" className="footer-link">
            Hosting plans
          </Link>
          <Link href="/login" className="footer-link">
            Customer portal
          </Link>
          <Link href="/#support" className="footer-link">
            Get support
          </Link>
          <Link href="/register" className="footer-link">
            Create account
          </Link>
        </nav>
      </div>
      <div className="border-t border-slate-200 px-4 py-5 text-center text-xs text-slate-500">
        © 2026 {branding.name}. Fictional demonstration content.
      </div>
    </footer>
  );
}
