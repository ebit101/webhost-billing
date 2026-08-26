import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuthenticatedIdentity, requireWorkspaceRole } from './server-auth';

const nextServer = vi.hoisted(() => ({
  cookies: vi.fn(),
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('next/headers', () => ({ cookies: nextServer.cookies }));
vi.mock('next/navigation', () => ({ redirect: nextServer.redirect }));

describe('server workspace authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nextServer.cookies.mockResolvedValue({
      get: (name: string) =>
        name === 'webhost_session'
          ? { name, value: 'opaque-session-token' }
          : undefined,
    });
  });

  it('redirects an anonymous request to login without calling the API', async () => {
    nextServer.cookies.mockResolvedValue({ get: () => undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(requireWorkspaceRole('ADMIN')).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no identity for an anonymous administrator entry page', async () => {
    nextServer.cookies.mockResolvedValue({ get: () => undefined });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('redirects an expired or invalid session to login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(requireWorkspaceRole('CUSTOMER')).rejects.toThrow(
      'NEXT_REDIRECT:/login',
    );
  });

  it('returns no identity for an expired administrator session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );

    await expect(getAuthenticatedIdentity()).resolves.toBeNull();
  });

  it('allows an administrator into the administrator workspace', async () => {
    const fetchMock = vi.fn().mockResolvedValue(identityResponse('ADMIN'));
    vi.stubGlobal('fetch', fetchMock);

    const identity = await requireWorkspaceRole('ADMIN');

    expect(identity.role).toBe('ADMIN');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/me$/),
      expect.objectContaining({
        cache: 'no-store',
        headers: { cookie: 'webhost_session=opaque-session-token' },
      }),
    );
  });

  it.each([
    ['ADMIN', 'CUSTOMER', '/admin'],
    ['CUSTOMER', 'ADMIN', '/portal'],
  ] as const)(
    'redirects a %s identity away from a %s-only workspace',
    async (actualRole, requiredRole, destination) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(identityResponse(actualRole)),
      );

      await expect(requireWorkspaceRole(requiredRole)).rejects.toThrow(
        `NEXT_REDIRECT:${destination}`,
      );
      expect(nextServer.redirect).toHaveBeenCalledWith(destination);
    },
  );

  it('fails closed when the API response cannot be validated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { role: 'ADMIN' } }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(requireWorkspaceRole('ADMIN')).rejects.toThrow(
      'invalid response',
    );
  });
});

function identityResponse(role: 'ADMIN' | 'CUSTOMER') {
  const data =
    role === 'ADMIN'
      ? {
          userId: '10000000-0000-4000-8000-000000000001',
          email: 'admin@example.test',
          role,
          adminProfileId: '10000000-0000-4000-8000-000000000002',
        }
      : {
          userId: '20000000-0000-4000-8000-000000000001',
          email: 'customer@example.test',
          role,
          customerId: '20000000-0000-4000-8000-000000000002',
        };

  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
