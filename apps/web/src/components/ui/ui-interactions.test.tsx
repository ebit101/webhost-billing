import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { ConfirmationDialog } from './confirmation-dialog';
import { DataTable, type DataColumn } from './data-table';
import { StatusBadge } from './status-badge';
import { ToastProvider, useToast } from './toast';

function DialogHarness({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Open confirmation
      </Button>
      <ConfirmationDialog
        open={open}
        title="Confirm preview"
        description="No data will change."
        onClose={() => setOpen(false)}
        onConfirm={onConfirm}
      />
    </>
  );
}

function ToastHarness() {
  const { notify } = useToast();
  return (
    <Button
      type="button"
      onClick={() =>
        notify({
          title: 'Saved safely',
          description: 'The fictional preview is ready.',
          tone: 'success',
        })
      }
    >
      Show notification
    </Button>
  );
}

describe('interactive UI primitives', () => {
  it('focuses the confirmation action and closes on Escape', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<DialogHarness onConfirm={confirm} />);

    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Confirm' }),
    );

    await user.keyboard('{Tab}');
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' }),
    );

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });

  it('confirms a dialog through the explicit action', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    render(<DialogHarness onConfirm={confirm} />);

    await user.click(screen.getByRole('button', { name: 'Open confirmation' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('announces and dismisses toast notifications', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ToastHarness />
      </ToastProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Show notification' }));
    expect(screen.getByRole('status').textContent).toContain('Saved safely');
    await user.click(
      screen.getByRole('button', { name: 'Dismiss notification' }),
    );
    expect(screen.queryByText('Saved safely')).toBeNull();
  });
});

describe('data display primitives', () => {
  it('renders a captioned table and an accessible status label', () => {
    const rows = [{ id: 'INV-1', status: 'Paid' }];
    const columns: DataColumn<(typeof rows)[number]>[] = [
      { key: 'id', header: 'Invoice', render: (row) => row.id },
      {
        key: 'status',
        header: 'Status',
        render: (row) => <StatusBadge tone="success">{row.status}</StatusBadge>,
      },
    ];

    render(
      <DataTable
        caption="Recent invoices"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole('table', { name: 'Recent invoices' })).toBeTruthy();
    expect(screen.getByText('Paid')).toBeTruthy();
  });
});
