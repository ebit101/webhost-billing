import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceShell,
  type WorkspaceNavigationItem,
} from './workspace-shell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/portal',
}));

vi.mock('next/link', () => ({
  default: ({ href, onClick, children, ...props }: ComponentProps<'a'>) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

const navigation: WorkspaceNavigationItem[] = [
  { href: '/portal', label: 'Overview', icon: 'dashboard' },
  { href: '/portal/services', label: 'My services', icon: 'server' },
];

describe('WorkspaceShell', () => {
  it('opens and closes responsive navigation with accessible controls', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell
        mode="portal"
        navigation={navigation}
        userName="Amina Rahman"
        userDetail="amina@example.test"
      >
        <h1>Portal content</h1>
      </WorkspaceShell>,
    );

    const openButton = screen.getByRole('button', { name: 'Open navigation' });
    expect(openButton.getAttribute('aria-expanded')).toBe('false');
    expect(
      screen
        .getByRole('link', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');

    await user.click(openButton);
    expect(openButton.getAttribute('aria-expanded')).toBe('true');
    expect(
      screen.getAllByRole('button', { name: 'Close navigation' }),
    ).toHaveLength(2);

    await user.keyboard('{Escape}');
    expect(openButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(openButton);
  });

  it('closes mobile navigation when a destination is selected', async () => {
    const user = userEvent.setup();
    render(
      <WorkspaceShell
        mode="portal"
        navigation={navigation}
        userName="Amina Rahman"
        userDetail="amina@example.test"
      >
        <h1>Portal content</h1>
      </WorkspaceShell>,
    );

    const openButton = screen.getByRole('button', { name: 'Open navigation' });
    await user.click(openButton);
    await user.click(screen.getByRole('link', { name: 'My services' }));
    expect(openButton.getAttribute('aria-expanded')).toBe('false');
  });
});
