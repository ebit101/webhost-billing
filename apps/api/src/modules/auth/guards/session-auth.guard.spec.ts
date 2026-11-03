import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CUSTOMER_SUPPORT_ACCESS_KEY } from '../decorators/customer-support-session.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthCookieService } from '../services/auth-cookie.service';
import type { AuthService } from '../services/auth.service';
import { SessionAuthGuard } from './session-auth.guard';

function fixture({
  method,
  access,
  isPublic,
  parent = true,
  support = true,
}: {
  method: string;
  access?: 'read' | 'end';
  isPublic?: boolean;
  parent?: boolean;
  support?: boolean;
}) {
  const handler = () => undefined;
  if (access)
    Reflect.defineMetadata(CUSTOMER_SUPPORT_ACCESS_KEY, access, handler);
  if (isPublic) Reflect.defineMetadata(IS_PUBLIC_KEY, true, handler);
  const request = { method, auth: undefined };
  const set = jest.fn();
  const cookies = {
    sessionCookieName: 'primary',
    supportCookieName: 'support',
    read: jest.fn((_request: unknown, name: string) =>
      name === 'primary'
        ? parent
          ? 'admin-token'
          : undefined
        : support
          ? 'support-token'
          : undefined,
    ),
  };
  const auth = {
    authenticateSession: jest
      .fn()
      .mockResolvedValue({ identity: { role: 'ADMIN' } }),
    authenticateCustomerSupportSession: jest
      .fn()
      .mockResolvedValue({ identity: { role: 'CUSTOMER' } }),
  };
  const guard = new SessionAuthGuard(
    new Reflector(),
    cookies as unknown as AuthCookieService,
    auth as unknown as AuthService,
  );
  const run = () =>
    guard.canActivate({
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ set }),
      }),
    } as unknown as ExecutionContext);
  return { run, auth, request, set };
}

describe('support session route boundary', () => {
  it('uses the scoped customer identity for explicitly permitted reads', async () => {
    const { run, auth, request, set } = fixture({
      method: 'GET',
      access: 'read',
    });
    await expect(run()).resolves.toBe(true);
    expect(auth.authenticateCustomerSupportSession).toHaveBeenCalledWith(
      'admin-token',
      'support-token',
    );
    expect(auth.authenticateSession).not.toHaveBeenCalled();
    expect(request.auth).toEqual({ identity: { role: 'CUSTOMER' } });
    expect(set).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it.each(['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'])(
    'blocks unlisted %s routes',
    async (method) => {
      const { run, auth } = fixture({ method });
      await expect(run()).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(auth.authenticateSession).not.toHaveBeenCalled();
    },
  );

  it.each(['GET', 'POST'])(
    'blocks public %s endpoints without an explicit exception',
    async (method) => {
      await expect(
        fixture({ method, isPublic: true }).run(),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    },
  );

  it('blocks unsafe methods even when a handler is tagged for read access', async () => {
    await expect(
      fixture({ method: 'PATCH', access: 'read' }).run(),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires the parent session and never falls back after a failed support lookup', async () => {
    await expect(
      fixture({ method: 'GET', access: 'read', parent: false }).run(),
    ).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    const { run, auth } = fixture({ method: 'GET', access: 'read' });
    auth.authenticateCustomerSupportSession.mockRejectedValue(
      new Error('Expired'),
    );
    await expect(run()).rejects.toThrow('Expired');
    expect(auth.authenticateSession).not.toHaveBeenCalled();
  });

  it('allows the end endpoint to clear an expired cookie and preserves ordinary administrator authentication', async () => {
    await expect(
      fixture({
        method: 'POST',
        access: 'end',
        isPublic: true,
        parent: false,
      }).run(),
    ).resolves.toBe(true);
    const { run, auth } = fixture({ method: 'GET', support: false });
    await expect(run()).resolves.toBe(true);
    expect(auth.authenticateSession).toHaveBeenCalledWith('admin-token');
  });
});
