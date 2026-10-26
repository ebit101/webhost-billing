import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RecordAction, RecordDialog } from './record-dialog';

describe('record dialogs', () => {
  it('restores scrolling when a route removes both a parent and its later-opened child', () => {
    const close = vi.fn();
    const content = (childOpen: boolean) => (
      <RecordDialog open title="Parent" onClose={close}>
        <RecordDialog open={childOpen} title="Child" onClose={close}>
          Details
        </RecordDialog>
      </RecordDialog>
    );
    const view = render(content(false));
    view.rerender(content(true));
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('opens on an explicit action and retains an unsaved draft after closing', async () => {
    const user = userEvent.setup();
    render(
      <RecordAction label="Create record">
        <label>
          Reference
          <input name="reference" />
        </label>
      </RecordAction>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    const trigger = screen.getByRole('button', { name: 'Create record' });
    await user.click(trigger);
    await user.type(
      screen.getByRole('textbox', { name: 'Reference' }),
      'Unsaved draft',
    );
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    await user.click(trigger);
    expect(screen.getByRole('textbox', { name: 'Reference' })).toHaveProperty(
      'value',
      'Unsaved draft',
    );
  });

  it('blocks cancellation during a pending mutation and restores scrolling afterwards', () => {
    const onClose = vi.fn();
    const result = render(
      <RecordDialog open busy title="Record action" onClose={onClose}>
        Working
      </RecordDialog>,
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(document.body.style.overflow).toBe('hidden');
    result.rerender(
      <RecordDialog open title="Record action" onClose={onClose}>
        Done
      </RecordDialog>,
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    result.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
