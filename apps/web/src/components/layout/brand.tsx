import Link from 'next/link';
import { Icon } from '../ui/icon';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${
        inverse
          ? 'text-white focus-visible:outline-white'
          : 'text-slate-950 focus-visible:outline-brand-600'
      }`}
      aria-label="Webhost Billing home"
    >
      <span
        className={`grid size-9 place-items-center rounded-xl ${
          inverse
            ? 'bg-white text-slate-950'
            : 'bg-brand-600 text-white shadow-sm shadow-brand-900/20'
        }`}
      >
        <Icon name="server" className="size-5" />
      </span>
      <span className="leading-none">
        <span className="block text-[0.68rem] font-bold uppercase tracking-[0.18em] opacity-65">
          Webhost
        </span>
        <span className="mt-1 block text-base font-bold tracking-tight">
          Billing
        </span>
      </span>
    </Link>
  );
}
