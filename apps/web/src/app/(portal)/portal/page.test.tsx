import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortalDashboard from './page';

const serverAuth = vi.hoisted(() => ({ requireWorkspaceRole: vi.fn() }));

vi.mock('../../../lib/server-auth', () => serverAuth);

describe('portal overview server boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('binds the overview customer id to the server-validated customer session', async () => {
    serverAuth.requireWorkspaceRole.mockResolvedValue({
      userId: '70000000-0000-4000-8000-000000000002',
      email: 'customer@example.test',
      role: 'CUSTOMER',
      customerId: '70000000-0000-4000-8000-000000000001',
    });

    const result = await PortalDashboard();

    expect(serverAuth.requireWorkspaceRole).toHaveBeenCalledWith('CUSTOMER');
    expect(result).toMatchObject({
      props: { customerId: '70000000-0000-4000-8000-000000000001' },
    });
  });
});
