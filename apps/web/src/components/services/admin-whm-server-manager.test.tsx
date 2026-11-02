import type {
  ManagedCpanelServer,
  ManagedServer,
} from '@webhost-billing/shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminWhmServerManager } from './admin-whm-server-manager';

const server: ManagedCpanelServer = {
  server: {
    id: '90000000-0000-4000-8000-000000000001',
    name: 'Fictional WHM',
    hostname: 'whm.example.test',
    status: 'DISABLED',
    adapterKey: 'cpanel-whm',
  },
  port: 2087,
  useTls: true,
  apiUsername: 'reseller',
  credentialConfigured: true,
  credentialKeyVersion: 'cpanel-token-v1',
  maxAccounts: 10,
  assignedServiceCount: 0,
};

function success(data: unknown) {
  return { ok: true, json: async () => ({ success: true, data }) } as Response;
}

describe('WHM server administration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds a disabled server, keeps the token out of the listing, and requires exact removal confirmation', async () => {
    const user = userEvent.setup();
    let servers: ManagedCpanelServer[] = [];
    const fetchMock = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        const path = String(request);
        if (path.endsWith('/auth/csrf'))
          return success({ csrfToken: 'x'.repeat(32) });
        if (path.endsWith('/hosting-panel/servers') && !init?.method)
          return success(servers);
        if (
          path.endsWith('/hosting-panel/servers') &&
          init?.method === 'POST'
        ) {
          servers = [server];
          return success(server);
        }
        if (
          path.endsWith(`/hosting-panel/servers/${server.server.id}`) &&
          init?.method === 'DELETE'
        ) {
          servers = [];
          return success({ removed: true });
        }
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'prompt',
      vi.fn().mockReturnValueOnce('wrong').mockReturnValueOnce('REMOVE_SERVER'),
    );
    render(<AdminWhmServerManager />);
    expect(await screen.findByText('No servers')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Server name' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Add new server' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Server name' }),
      'Fictional WHM',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'WHM hostname' }),
      'whm.example.test',
    );
    await user.type(
      screen.getByRole('textbox', { name: 'WHM username' }),
      'reseller',
    );
    const token = 'FictionalTokenValue1234567890';
    await user.type(screen.getByLabelText('WHM API token'), token);
    await user.click(
      screen.getByRole('button', { name: 'Add disabled server' }),
    );
    expect(
      await screen.findByRole('cell', { name: 'Fictional WHM' }),
    ).toBeTruthy();
    expect(screen.queryByText(token)).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Server name' })).toBeNull();
    const creation = fetchMock.mock.calls.find(
      ([path, init]) =>
        String(path).endsWith('/hosting-panel/servers') &&
        init?.method === 'POST',
    );
    expect(JSON.parse(String(creation?.[1]?.body))).toMatchObject({
      apiToken: token,
      hostname: 'whm.example.test',
    });
    await user.click(
      screen.getByRole('button', { name: 'Edit Fictional WHM' }),
    );
    expect(screen.getByRole('textbox', { name: 'Server name' })).toHaveProperty(
      'value',
      'Fictional WHM',
    );
    expect(screen.getByLabelText('New API token (optional)')).toHaveProperty(
      'value',
      '',
    );
    await user.click(screen.getByRole('button', { name: 'Remove server' }));
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE'),
    ).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Remove server' }));
    expect(await screen.findByText('No servers')).toBeTruthy();
    const removal = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'DELETE',
    );
    expect(JSON.parse(String(removal?.[1]?.body))).toEqual({
      confirmation: 'REMOVE_SERVER',
    });
  });

  it('shows a compact list and opens only the selected server for editing', async () => {
    const user = userEvent.setup();
    const second: ManagedCpanelServer = {
      ...server,
      server: {
        ...server.server,
        id: '90000000-0000-4000-8000-000000000002',
        name: 'Backup WHM',
        hostname: 'backup.example.test',
        status: 'MAINTENANCE',
      },
      assignedServiceCount: 2,
    };
    const fetchMock = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        const path = String(request);
        if (path.endsWith('/auth/csrf'))
          return success({ csrfToken: 'x'.repeat(32) });
        if (path.endsWith('/hosting-panel/servers') && !init?.method)
          return success([server, second]);
        if (
          path.endsWith(`/hosting-panel/servers/${second.server.id}`) &&
          init?.method === 'PATCH'
        )
          return success(second);
        throw new Error(`Unexpected request: ${path}`);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminWhmServerManager />);
    expect(await screen.findByText('2 servers')).toBeTruthy();
    expect(
      screen.getByRole('columnheader', { name: 'Server type' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('cell', { name: 'cPanel server' })).toHaveLength(
      2,
    );
    expect(screen.getByRole('cell', { name: 'Fictional WHM' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Backup WHM' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Server name' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Edit Backup WHM' }));
    expect(screen.getByRole('textbox', { name: 'Server name' })).toHaveProperty(
      'value',
      'Backup WHM',
    );
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveProperty(
      'value',
      'MAINTENANCE',
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Server name' })).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Edit Fictional WHM' }),
    );
    expect(screen.getByRole('textbox', { name: 'Server name' })).toHaveProperty(
      'value',
      'Fictional WHM',
    );
    await user.click(screen.getByRole('button', { name: 'Edit Backup WHM' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Server changes saved.')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Server name' })).toBeNull();
    const update = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    );
    expect(String(update?.[0])).toContain(second.server.id);
    expect(JSON.parse(String(update?.[1]?.body))).toMatchObject({
      name: 'Backup WHM',
      status: 'MAINTENANCE',
    });
    expect(JSON.parse(String(update?.[1]?.body))).not.toHaveProperty(
      'apiToken',
    );
  });
  it('switches provider fields, clears credentials across types and saves a Virtualizor node without testing it', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        if (String(request).endsWith('/auth/csrf'))
          return success({ csrfToken: 'x'.repeat(32) });
        if (init?.method === 'POST') return success(server);
        return success([]);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminWhmServerManager />);
    await screen.findByText('No servers');
    await user.click(screen.getByRole('button', { name: 'Add new server' }));
    await user.type(
      screen.getByLabelText('WHM API token'),
      'FictionalCpanelToken123456',
    );
    await user.selectOptions(
      screen.getByLabelText('Server type'),
      'VIRTUALIZOR',
    );
    expect(screen.queryByLabelText('WHM username')).toBeNull();
    expect(screen.queryByLabelText('WHM API token')).toBeNull();
    expect(screen.getByLabelText('HTTPS port')).toHaveProperty('value', '4085');
    await user.type(
      screen.getByLabelText('Virtualizor API key'),
      'discard-this-key',
    );
    await user.selectOptions(screen.getByLabelText('Server type'), 'VULTR');
    expect(screen.getByLabelText('API hostname')).toHaveProperty(
      'value',
      'api.vultr.com',
    );
    expect(screen.queryByLabelText('Virtualizor API password')).toBeNull();
    expect(screen.getByText(/Configuration only/)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Server type'), 'SHOUTCAST');
    expect(
      screen.getByLabelText('ShoutCast administrator password'),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Vultr API key')).toBeNull();
    await user.selectOptions(
      screen.getByLabelText('Server type'),
      'VIRTUALIZOR',
    );
    expect(screen.getByLabelText('Virtualizor API key')).toHaveProperty(
      'value',
      '',
    );
    await user.type(screen.getByLabelText('Server name'), 'Fictional node');
    await user.type(
      screen.getByLabelText('Virtualizor master hostname'),
      'node.example.test',
    );
    await user.type(
      screen.getByLabelText('Virtualizor API key'),
      'fictional-key',
    );
    await user.type(
      screen.getByLabelText('Virtualizor API password'),
      'fictional-pass',
    );
    await user.click(
      screen.getByRole('button', { name: 'Add disabled server' }),
    );
    await screen.findByText(/Server saved as disabled/);
    const writes = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === 'POST',
    );
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({
      name: 'Fictional node',
      hostname: 'node.example.test',
      port: 4085,
      serverType: 'VIRTUALIZOR',
      maxAccounts: null,
      credentials: { apiKey: 'fictional-key', apiPassword: 'fictional-pass' },
    });
  });
  it('shows a Virtualizor type in the list and edits it without resending retained credentials or offering activation', async () => {
    const user = userEvent.setup();
    const node: ManagedServer = {
      ...server,
      server: {
        ...server.server,
        name: 'Fictional node',
        adapterKey: 'virtualizor',
        hostname: 'node.example.test',
      },
      port: 4085,
      apiUsername: null,
    };
    const fetchMock = vi.fn(
      async (request: RequestInfo | URL, init?: RequestInit) => {
        if (String(request).endsWith('/auth/csrf'))
          return success({ csrfToken: 'x'.repeat(32) });
        return success(init?.method === 'PATCH' ? node : [node]);
      },
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<AdminWhmServerManager />);
    expect(
      await screen.findByRole('cell', {
        name: 'VPS node server (Virtualizor)',
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole('button', { name: 'Edit Fictional node' }),
    );
    expect(screen.getByLabelText('Server type')).toHaveProperty(
      'value',
      'VPS node server (Virtualizor)',
    );
    expect(screen.getByLabelText('New API key (optional)')).toHaveProperty(
      'value',
      '',
    );
    expect(screen.queryByRole('option', { name: 'Active' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Server changes saved.');
    const update = fetchMock.mock.calls.find(
      ([, init]) => init?.method === 'PATCH',
    );
    expect(JSON.parse(String(update?.[1]?.body))).toEqual({
      serverType: 'VIRTUALIZOR',
      name: 'Fictional node',
      hostname: 'node.example.test',
      port: 4085,
      maxAccounts: 10,
      status: 'DISABLED',
    });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/test')),
    ).toHaveLength(0);
  });
});
