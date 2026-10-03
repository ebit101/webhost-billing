import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import HomePage from '../../app/(store)/page';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('public storefront navigation', () => {
  it('provides a real local target for every displayed navigation path', () => {
    render(
      <>
        <PublicHeader />
        <HomePage />
        <PublicFooter />
      </>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Hosting that keeps service and billing in view.',
      }),
    ).toBeTruthy();
    expect(document.querySelector('main#main-content')).toBeTruthy();
    expect(document.getElementById('why-us')).toBeTruthy();
    expect(document.getElementById('support')).toBeTruthy();

    expectLinks('Webhost Billing home', '/');
    expectLinks('Home', '/');
    expectLinks('Hosting plans', '/hosting');
    expectLinks('Why us', '/#why-us');
    expectLinks('Support', '/#support');
    expectLinks('Sign in', '/login');
    expectLinks('Get started', '/register');
    expectLinks('Explore hosting plans', '/hosting');
    expectLinks('Create customer account', '/register');
    expectLinks('Sign in to your portal', '/login');
    expectLinks('Sign in for support', '/login');
    expectLinks('Create an account', '/register');
    expectLinks('Customer portal', '/login');
    expectLinks('Get support', '/#support');

    const allowedTargets = new Set([
      '/',
      '/hosting',
      '/#why-us',
      '/#support',
      '/login',
      '/register',
    ]);
    for (const link of screen.getAllByRole('link')) {
      expect(allowedTargets.has(link.getAttribute('href') ?? '')).toBe(true);
    }
  });
});

function expectLinks(name: string, href: string) {
  const links = screen.getAllByRole('link', { name });
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) expect(link.getAttribute('href')).toBe(href);
}
