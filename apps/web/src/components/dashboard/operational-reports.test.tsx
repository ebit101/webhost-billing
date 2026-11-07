import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  operationalReports,
  type OperationalReportResponse,
} from '@webhost-billing/shared';
import { authenticatedGet, authenticatedDownload } from '../../lib/auth-api';
import { AdminReports } from './admin-reports';
vi.mock('../../lib/auth-api', () => ({
  authenticatedGet: vi.fn(),
  authenticatedDownload: vi.fn(),
}));
const sample: OperationalReportResponse = {
  report: 'income',
  generatedAt: '2028-04-01T00:00:00.000Z',
  currency: 'BDT',
  timeZone: 'Asia/Dhaka',
  period: { from: '2028-04-01', to: '2028-04-01' },
  rows: [{ id: 'one', cells: ['Purchased starter', 'Hosting', '25000'] }],
  totals: ['', '', '75000'],
  pagination: { page: 1, pageSize: 20, totalItems: 21, totalPages: 2 },
};
beforeEach(() => {
  vi.mocked(authenticatedGet).mockReset().mockResolvedValue(sample);
  vi.mocked(authenticatedDownload).mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('exposes seven labelled reports and whole-result totals, with forecasts clearly separate', async () => {
  const user = userEvent.setup();
  render(<AdminReports tab="operations" />);
  expect(await screen.findByText('Purchased starter')).toBeTruthy();
  expect(
    screen.getByRole('link', {
      name: 'Operational and financial',
      current: 'page',
    }),
  ).toBeTruthy();
  expect(
    within(screen.getByLabelText('Report')).getAllByRole('option'),
  ).toHaveLength(7);
  expect(screen.getByText('BDT 250.00')).toBeTruthy();
  expect(screen.getByText('BDT 750.00')).toBeTruthy();
  vi.mocked(authenticatedGet).mockResolvedValue({
    ...sample,
    report: 'recurring',
    rows: [],
    totals: ['', '', '', '0', '0'],
  });
  await user.selectOptions(screen.getByLabelText('Report'), 'recurring');
  expect(await screen.findByText('No matching report rows.')).toBeTruthy();
  expect(screen.getByText(operationalReports.recurring.notes)).toBeTruthy();
  expect(screen.queryByText('Purchased starter')).toBeNull();
});
it('paginates with the applied business dates and preserves full totals', async () => {
  const user = userEvent.setup();
  render(<AdminReports tab="operations" />);
  await screen.findByText('Purchased starter');
  vi.mocked(authenticatedGet).mockResolvedValue({
    ...sample,
    pagination: { ...sample.pagination, page: 2 },
    rows: [{ id: 'two', cells: ['Purchased backup', 'Add-on', '50000'] }],
  });
  await user.click(screen.getByRole('button', { name: 'Next page' }));
  expect(await screen.findByText('Purchased backup')).toBeTruthy();
  expect(authenticatedGet).toHaveBeenLastCalledWith(
    expect.stringMatching(/page=2.*from=2028-04-01.*to=2028-04-01/),
  );
  expect(screen.getByText('BDT 750.00')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled'),
  ).toBe(true);
});
it('exports only the loaded scope and cleans up its download URL', async () => {
  const user = userEvent.setup();
  render(<AdminReports tab="operations" />);
  await screen.findByText('Purchased starter');
  const create = vi.fn().mockReturnValue('blob:fictional-report');
  const revoke = vi.fn();
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.mocked(authenticatedDownload).mockResolvedValue({
    blob: new Blob(['fictional csv']),
    filename: 'report.csv',
  });
  await user.clear(screen.getByLabelText('From'));
  await user.type(screen.getByLabelText('From'), '2028-05-01');
  await user.click(screen.getByRole('button', { name: 'Export report CSV' }));
  await waitFor(() =>
    expect(authenticatedDownload).toHaveBeenCalledWith(
      '/reports/operations/income/export',
      sample.period,
    ),
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(revoke).toHaveBeenCalledWith('blob:fictional-report');
});
it('fails visibly without leaving an old report exportable and retries', async () => {
  vi.mocked(authenticatedGet).mockRejectedValueOnce(
    new Error('Reports require a full administrator account.'),
  );
  const user = userEvent.setup();
  render(<AdminReports tab="operations" />);
  expect((await screen.findByRole('alert')).textContent).toContain(
    'full administrator',
  );
  expect(
    screen
      .getByRole('button', { name: 'Export report CSV' })
      .hasAttribute('disabled'),
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Purchased starter')).toBeTruthy();
});
