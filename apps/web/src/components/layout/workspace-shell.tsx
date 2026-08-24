'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../ui/icon';
import { Brand } from './brand';

export interface WorkspaceNavigationItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
}

export function WorkspaceShell({
  mode,
  navigation,
  userName,
  userDetail,
  children,
}: {
  mode: 'portal' | 'admin';
  navigation: readonly WorkspaceNavigationItem[];
  userName: string;
  userDetail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLButtonElement>(null);
  const closeMenuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const overflow = document.body.style.overflow;
    const openMenuButton = openMenuRef.current;
    document.body.style.overflow = 'hidden';
    closeMenuRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      openMenuButton?.focus();
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      {menuOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        id={`${mode}-navigation`}
        className={`fixed inset-y-0 left-0 z-50 flex w-[18rem] flex-col bg-slate-950 text-white transition-transform duration-200 motion-reduce:transition-none lg:translate-x-0 ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
          <Brand inverse />
          <button
            ref={closeMenuRef}
            type="button"
            onClick={() => setMenuOpen(false)}
            className="grid size-10 place-items-center rounded-xl text-slate-300 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white lg:hidden"
          >
            <span className="sr-only">Close navigation</span>
            <Icon name="close" className="size-5" />
          </button>
        </div>
        <div className="px-5 pt-5">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-slate-500">
            {mode === 'admin' ? 'Administrator' : 'Customer portal'}
          </p>
        </div>
        <nav
          aria-label={
            mode === 'admin'
              ? 'Administrator navigation'
              : 'Customer portal navigation'
          }
          className="mt-3 flex-1 overflow-y-auto px-3 pb-6"
        >
          <ul className="grid gap-1">
            {navigation.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== `/${mode}` &&
                  pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                      active
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-950/25'
                        : 'text-slate-300 hover:bg-white/8 hover:text-white'
                    }`}
                  >
                    <Icon name={item.icon} className="size-[1.15rem]" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.68rem] font-bold ${
                          active
                            ? 'bg-white/20 text-white'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 p-4">
          <Link
            href="/account"
            className="flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <span className="grid size-10 place-items-center rounded-xl bg-brand-500 text-sm font-bold text-white">
              {initials(userName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">
                {userName}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-400">
                {userDetail}
              </span>
            </span>
          </Link>
        </div>
      </aside>

      <div className="lg:pl-[18rem]">
        <header className="sticky top-0 z-30 flex h-18 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            ref={openMenuRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls={`${mode}-navigation`}
            onClick={() => setMenuOpen(true)}
            className="grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 lg:hidden"
          >
            <span className="sr-only">Open navigation</span>
            <Icon name="menu" className="size-5" />
          </button>
          <label className="relative hidden max-w-md flex-1 md:block">
            <span className="sr-only">Search this workspace</span>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              placeholder={
                mode === 'admin'
                  ? 'Search customers, invoices, services…'
                  : 'Search services and invoices…'
              }
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-100"
            />
          </label>
          <div className="flex-1 md:hidden" />
          <span className="hidden rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 sm:inline-flex">
            Fictional workspace
          </span>
          <button
            type="button"
            className="relative grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
          >
            <span className="sr-only">View notifications</span>
            <Icon name="bell" className="size-5" />
            <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-white bg-red-500" />
          </button>
          <Link
            href="/account"
            className="grid size-10 place-items-center rounded-xl bg-slate-950 text-xs font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            aria-label="Open account settings"
          >
            {initials(userName)}
          </Link>
        </header>
        <main id="main-content" className="px-4 py-7 sm:px-6 sm:py-8 xl:px-10">
          <div className="mx-auto max-w-[95rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
