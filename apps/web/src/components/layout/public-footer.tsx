import Link from 'next/link';
import { Brand } from './brand';

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto] lg:px-8">
        <div>
          <Brand />
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">
            Straightforward hosting and billing for one focused local hosting
            team.
          </p>
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
        © 2026 Webhost Billing. Fictional demonstration content.
      </div>
    </footer>
  );
}
