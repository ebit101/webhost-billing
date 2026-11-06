import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { authenticatedGet, authenticatedFile } from '../../lib/auth-api';
import {
  TicketAttachmentInput,
  TicketAttachmentDownloads,
} from './ticket-attachments';

vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: vi.fn(),
  authenticatedFile: vi.fn(),
}));
afterEach(() => vi.resetAllMocks());

it('keeps text messaging available while uploads are disabled by policy', async () => {
  vi.mocked(authenticatedGet).mockResolvedValue({ enabled: false });
  const { container } = render(<TicketAttachmentInput disabled={false} />);
  expect(
    await screen.findByText(/unavailable until malware screening/),
  ).toBeTruthy();
  expect((container.querySelector('input') as HTMLInputElement).disabled).toBe(
    true,
  );
});

it('shows expired attachments without downloading them and handles revoked access', async () => {
  const user = userEvent.setup();
  vi.mocked(authenticatedFile).mockRejectedValue(
    new Error('Fictional access revoked'),
  );
  render(
    <TicketAttachmentDownloads
      files={[
        {
          id: '21700000-0000-4000-8000-000000000001',
          filename: 'expired.log',
          mediaType: 'text/plain',
          sizeBytes: 10,
          status: 'EXPIRED',
          expiresAt: '2020-01-01T00:00:00.000Z',
        },
        {
          id: '21700000-0000-4000-8000-000000000002',
          filename: 'current.log',
          mediaType: 'text/plain',
          sizeBytes: 10,
          status: 'ATTACHED',
          expiresAt: '2099-01-01T00:00:00.000Z',
        },
      ]}
    />,
  );
  expect(
    (screen.getByRole('button', { name: 'expired.log' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: 'current.log' }));
  expect((await screen.findByRole('alert')).textContent).toContain(
    'access may have changed',
  );
  expect(authenticatedFile).toHaveBeenCalledOnce();
});
