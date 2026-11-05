import type { SupportDepartment } from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SupportDepartmentManager } from './support-department-manager';

const department: SupportDepartment = {
  id: '21600000-0000-4000-8000-000000000002',
  name: 'Billing',
  enabled: true,
  customerVisible: true,
  restricted: false,
  revision: 2,
  memberUserIds: [],
};
const admin = {
  userId: '21600000-0000-4000-8000-000000000004',
  displayName: 'Fictional support member',
};
afterEach(() => vi.unstubAllGlobals());
describe('department configuration', () => {
  it('saves restrictions and selected staff with a reason and configuration revision', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data:
              !init?.method && String(input).includes('/auth/csrf')
                ? { csrfToken: 'a'.repeat(64) }
                : department,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(
      <SupportDepartmentManager
        departments={[department]}
        admins={[admin]}
        onSaved={onSaved}
      />,
    );
    await user.click(screen.getByText('Manage departments'));
    await user.click(screen.getByRole('button', { name: 'Billing' }));
    await user.click(
      screen.getByLabelText('Restrict staff access to selected members'),
    );
    await user.click(screen.getByLabelText(admin.displayName));
    await user.type(
      screen.getByLabelText('Support reason'),
      'Restrict fictional billing support',
    );
    await user.click(screen.getByRole('button', { name: 'Save department' }));
    expect((await screen.findByRole('status')).textContent).toContain(
      'Department saved.',
    );
    const mutation = fetchMock.mock.calls.find(([input]) =>
      String(input).includes(`/departments/${department.id}`),
    );
    expect(mutation).toBeTruthy();
    const init = fetchMock.mock.calls.find(([input]) =>
      String(input).includes(`/departments/${department.id}`),
    )?.[1];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      name: 'Billing',
      restricted: true,
      memberUserIds: [admin.userId],
      revision: 2,
      reason: 'Restrict fictional billing support',
    });
    expect(onSaved).toHaveBeenCalledOnce();
  });
  it('discards an unsaved department without a mutation', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <SupportDepartmentManager
        departments={[department]}
        admins={[admin]}
        onSaved={vi.fn()}
      />,
    );
    await user.click(screen.getByText('Manage departments'));
    await user.click(screen.getByRole('button', { name: 'Add department' }));
    await user.type(
      screen.getByLabelText('Department name'),
      'Unsaved department',
    );
    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(screen.queryByLabelText('Department name')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Billing' }));
    expect(
      (screen.getByLabelText('Department name') as HTMLInputElement).value,
    ).toBe('Billing');
  });
});
