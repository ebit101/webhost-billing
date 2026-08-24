'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { buttonStyles } from '../ui/button';
import { Icon } from '../ui/icon';
import { Brand } from './brand';

const navigation = [
  { href: '/', label: 'Home' },
  { href: '/hosting', label: 'Hosting plans' },
  { href: '/#why-us', label: 'Why us' },
  { href: '/#support', label: 'Support' },
] as const;

export function PublicHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Brand />
        <nav aria-label="Public navigation" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navigation.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={
                    item.href !== '/' && pathname === item.href
                      ? 'page'
                      : undefined
                  }
                  className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Link href="/login" className={buttonStyles('ghost', 'sm')}>
            Sign in
          </Link>
          <Link href="/register" className={buttonStyles('primary', 'sm')}>
            Get started
          </Link>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="public-mobile-navigation"
          onClick={() => setOpen((value) => !value)}
          className="grid size-11 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 md:hidden"
        >
          <span className="sr-only">
            {open ? 'Close navigation' : 'Open navigation'}
          </span>
          <Icon name={open ? 'close' : 'menu'} className="size-5" />
        </button>
      </div>
      <nav
        id="public-mobile-navigation"
        aria-label="Mobile public navigation"
        hidden={!open}
        className="border-t border-slate-200 bg-white p-4 md:hidden"
      >
        <ul className="grid gap-1">
          {navigation.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className={buttonStyles('secondary')}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            onClick={() => setOpen(false)}
            className={buttonStyles('primary')}
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}
