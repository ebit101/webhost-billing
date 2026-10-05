import Link from 'next/link';
import Image from 'next/image';
import { getWebBranding } from '../../lib/web-branding';
import { Icon } from '../ui/icon';

export function Brand({ inverse = false }: { inverse?: boolean }) {
  const branding = getWebBranding();
  return (
    <Link
      href="/"
      className={`inline-flex min-w-0 shrink-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 ${
        inverse
          ? 'text-white focus-visible:outline-white'
          : 'text-slate-950 focus-visible:outline-brand-600'
      }`}
      aria-label={`${branding.name} home`}
    >
      {branding.logoPath ? (
        <span className="inline-flex rounded-lg bg-white p-2">
          <Image
            src={branding.logoPath}
            alt={branding.name}
            width={branding.logoWidth}
            height={branding.logoHeight}
            unoptimized
            className="h-auto max-h-10 w-auto max-w-[9rem] object-contain sm:max-w-[11rem]"
          />
        </span>
      ) : branding.name !== 'Webhost Billing' ? (
        <span className="max-w-[9rem] break-words text-base font-bold sm:max-w-[11rem]">
          {branding.name}
        </span>
      ) : (
        <>
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
            <span
              className={`block text-[0.68rem] font-bold uppercase tracking-[0.18em] ${inverse ? 'text-white' : 'opacity-65'}`}
            >
              Webhost
            </span>
            <span className="mt-1 block text-base font-bold tracking-tight">
              Billing
            </span>
          </span>
        </>
      )}
    </Link>
  );
}
