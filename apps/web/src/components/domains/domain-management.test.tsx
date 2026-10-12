import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainManagementPanel } from './domain-management';
import { authenticatedGet, authMutation } from '../../lib/auth-api';
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: vi.fn(),
  authMutation: vi.fn(),
}));
const props = {
  domainId: '80000000-0000-4000-8000-000000000051',
  domainName: 'fictional-managed.com',
  administrator: true,
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function reads() {
  vi.mocked(authenticatedGet).mockImplementation(async (path) =>
    path.endsWith('/actions') ? [] : null,
  );
  vi.mocked(authMutation).mockResolvedValue([]);
}
describe('domain management controls', () => {
  it('GET loads local state only and customers cannot dispatch or reveal authorization codes', async () => {
    reads();
    render(<DomainManagementPanel {...props} administrator={false} />);
    await screen.findByText('No management or renewal actions yet.');
    expect(authenticatedGet).toHaveBeenCalledTimes(2);
    expect(authMutation).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Dispatch approved action once' }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Reveal authorization code' }),
    ).toBeNull();
    expect(
      screen
        .getByRole('link', { name: 'Contact support' })
        .getAttribute('href'),
    ).toBe('/portal/tickets');
  });
  it('saves a validated action without executing it and requires a separate dispatch', async () => {
    reads();
    render(<DomainManagementPanel {...props} />);
    await screen.findByText('No management or renewal actions yet.');
    fireEvent.change(screen.getByLabelText('Type exact domain name'), {
      target: { value: props.domainName },
    });
    fireEvent.change(
      screen.getByLabelText('New nameservers, separated by commas'),
      { target: { value: 'ns1.fictional-host.com, ns2.fictional-host.com' } },
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Save action for review' })
        .closest('form')!,
    );
    await waitFor(() =>
      expect(authMutation).toHaveBeenCalledExactlyOnceWith(
        `/domains/${props.domainId}/actions`,
        'POST',
        {
          confirmation: props.domainName,
          request: {
            kind: 'NAMESERVERS',
            nameservers: ['ns1.fictional-host.com', 'ns2.fictional-host.com'],
          },
        },
      ),
    );
  });
  it('keeps a revealed code out of storage and hides it on explicit dismissal', async () => {
    reads();
    vi.mocked(authMutation).mockResolvedValue({
      code: 'fictional-sensitive-code',
    });
    render(<DomainManagementPanel {...props} />);
    fireEvent.change(
      screen.getByLabelText('Confirm domain to reveal authorization code'),
      { target: { value: props.domainName } },
    );
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Reveal authorization code' })
        .closest('form')!,
    );
    await screen.findByText('fictional-sensitive-code');
    expect(JSON.stringify(localStorage)).not.toContain(
      'fictional-sensitive-code',
    );
    expect(window.location.href).not.toContain('fictional-sensitive-code');
    fireEvent.click(screen.getByRole('button', { name: 'Hide code now' }));
    expect(screen.queryByText('fictional-sensitive-code')).toBeNull();
  });
});
