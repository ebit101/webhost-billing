import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthShell } from '../auth/auth-shell';
import { Brand } from './brand';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';
import { WorkspaceShell } from './workspace-shell';
import { getBrandTitle, getWebBranding } from '../../lib/web-branding';
import HomePage from '../../app/(store)/page';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const values = {
  NEXT_PUBLIC_BRAND_NAME: 'Speed Host',
  NEXT_PUBLIC_BRAND_LOGO_PATH: '/branding/speed-host-logo.png',
  NEXT_PUBLIC_BRAND_LOGO_WIDTH: '285',
  NEXT_PUBLIC_BRAND_LOGO_HEIGHT: '63',
  NEXT_PUBLIC_BRAND_TAGLINE: 'better web solutions',
  NEXT_PUBLIC_BRAND_CONTACT_EMAIL: 'info@speedhost.com.bd',
  NEXT_PUBLIC_BRAND_CONTACT_PHONE: '+8801782391434',
  NEXT_PUBLIC_BRAND_CONTACT_ADDRESS:
    'AMM Tower, Merul Badda, Dhaka 1212, Bangladesh',
  NEXT_PUBLIC_BRAND_WEBSITE: 'https://www.speedhost.com.bd/',
};

beforeEach(() => {
  for (const key of Object.keys(values)) vi.stubEnv(key, '');
});
afterEach(() => vi.unstubAllEnvs());

function speedHost() {
  for (const [key, value] of Object.entries(values)) vi.stubEnv(key, value);
}

describe('installation web branding', () => {
  it('preserves generic branding, titles and fictional warnings with no configuration', () => {
    render(<PublicFooter />);
    expect(
      screen
        .getByRole('link', { name: 'Webhost Billing home' })
        .getAttribute('href'),
    ).toBe('/');
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByLabelText('Business contact information')).toBeNull();
    expect(
      screen.getByText(
        '© 2026 Webhost Billing. Fictional demonstration content.',
      ),
    ).toBeTruthy();
    expect(getBrandTitle()).toEqual({
      default: 'Webhost Billing',
      template: '%s · Webhost Billing',
    });
    expect(getBrandTitle('Administrator')).toEqual({
      default: 'Administrator · Webhost Billing',
      template: '%s · Administrator · Webhost Billing',
    });
    expect(getBrandTitle('Customer portal')).toEqual({
      default: 'Customer portal · Webhost Billing',
      template: '%s · Customer portal · Webhost Billing',
    });
  });

  it('uses the same local logo on public, authentication and both workspace surfaces', () => {
    speedHost();
    render(
      <>
        <PublicHeader />
        <AuthShell title="Sign in" description="Account access">
          <p>Form</p>
        </AuthShell>
        <WorkspaceShell
          mode="portal"
          navigation={[]}
          userName="Example Customer"
          userDetail="example@example.test"
        >
          <p>Customer content</p>
        </WorkspaceShell>
        <WorkspaceShell
          mode="admin"
          navigation={[]}
          userName="Example Admin"
          userDetail="admin@example.test"
        >
          <p>Admin content</p>
        </WorkspaceShell>
      </>,
    );
    expect(
      screen.getAllByRole('link', { name: 'Speed Host home' }),
    ).toHaveLength(5);
    for (const image of screen.getAllByRole('img', { name: 'Speed Host' })) {
      expect(image.getAttribute('src')).toBe('/branding/speed-host-logo.png');
      expect(image.getAttribute('width')).toBe('285');
      expect(image.getAttribute('height')).toBe('63');
      expect(image.getAttribute('class')).toContain('object-contain');
    }
    expect(screen.queryByText('Webhost')).toBeNull();
    expect(screen.getAllByText('Fictional workspace')).toHaveLength(2);
    expect(getBrandTitle()).toEqual({
      default: 'Speed Host',
      template: '%s · Speed Host',
    });
    expect(getBrandTitle('Administrator')).toEqual({
      default: 'Administrator · Speed Host',
      template: '%s · Administrator · Speed Host',
    });
    expect(getBrandTitle('Customer portal')).toEqual({
      default: 'Customer portal · Speed Host',
      template: '%s · Customer portal · Speed Host',
    });
  });

  it('renders approved contact links without changing portal routes or readiness claims', () => {
    speedHost();
    render(
      <>
        <HomePage />
        <PublicFooter />
      </>,
    );
    expect(screen.getByText('Why Speed Host')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: values.NEXT_PUBLIC_BRAND_CONTACT_EMAIL })
        .getAttribute('href'),
    ).toBe('mailto:info@speedhost.com.bd');
    expect(
      screen
        .getByRole('link', { name: values.NEXT_PUBLIC_BRAND_CONTACT_PHONE })
        .getAttribute('href'),
    ).toBe('tel:+8801782391434');
    expect(
      screen.getByText(values.NEXT_PUBLIC_BRAND_CONTACT_ADDRESS),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Business website' })
        .getAttribute('href'),
    ).toBe('https://www.speedhost.com.bd/');
    expect(
      screen
        .getByRole('link', { name: 'Customer portal' })
        .getAttribute('href'),
    ).toBe('/login');
    expect(
      screen.getByRole('link', { name: 'Get support' }).getAttribute('href'),
    ).toBe('/#support');
    expect(
      screen.getByText('© 2026 Speed Host. Fictional demonstration content.'),
    ).toBeTruthy();
  });

  it('provides an accessible text identity when no logo is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_BRAND_NAME', 'Example Hosting');
    render(<Brand inverse />);
    expect(
      screen.getByRole('link', { name: 'Example Hosting home' }),
    ).toBeTruthy();
    expect(screen.getByText('Example Hosting')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('fails closed for invalid public configuration without echoing its value', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_BRAND_LOGO_PATH',
      'https://private.example.test/secret',
    );
    expect(getWebBranding).toThrow(
      'Invalid public web branding configuration.',
    );
  });
});
