import type { Response } from 'express';
import { apiEnvironmentSchema } from '@webhost-billing/config';
import { AuthCookieService } from './auth-cookie.service';
import { hashOpaqueToken } from './auth-token.service';
import {
  administratorSessionMode,
  administratorSessionToken,
  administratorSessionTtl,
} from './admin-session-policy';

const day = 24 * 60 * 60 * 1_000;
const environment = apiEnvironmentSchema.parse({
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  CREDENTIAL_ENCRYPTION_KEY: 'test-encryption-key-at-least-32-characters',
});

describe('administrator session choice', () => {
  it('binds the choice to the full opaque token hash', () => {
    const browser = administratorSessionToken('fictional-random-token', false);
    const remembered = administratorSessionToken(
      'fictional-random-token',
      true,
    );
    expect(administratorSessionMode(browser)).toBe('browser');
    expect(administratorSessionMode(remembered)).toBe('remembered');
    expect(hashOpaqueToken(browser)).not.toBe(hashOpaqueToken(remembered));
    expect(administratorSessionTtl(browser, 7 * day)).toBe(day);
    expect(administratorSessionTtl(browser, 900_000)).toBe(900_000);
    expect(administratorSessionTtl(remembered, day)).toBe(30 * day);
    expect(administratorSessionTtl('existing-session-token', day)).toBe(
      365 * day,
    );
  });

  it.each([false, true])(
    'issues an HttpOnly cookie with remember device = %s',
    (rememberDevice) => {
      const cookie = jest.fn<void, [string, string, Record<string, unknown>]>();
      const response = { cookie } as unknown as Response;
      const token = administratorSessionToken(
        'fictional-random-token',
        rememberDevice,
      );
      const service = new AuthCookieService(environment);
      service.setSessionCookie(response, token, true);
      const options = cookie.mock.calls[0]?.[2];
      if (!options) throw new Error('Cookie was not set');
      expect(options).toMatchObject({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });
      expect('domain' in options).toBe(false);
      if (rememberDevice) expect(options.maxAge).toBe(30 * day);
      else expect('maxAge' in options).toBe(false);
    },
  );

  it('does not renew remembered cookie expiry past the database deadline', () => {
    const cookie = jest.fn<void, [string, string, Record<string, unknown>]>();
    const response = { cookie } as unknown as Response;
    const service = new AuthCookieService(environment);
    const token = administratorSessionToken('fictional-random-token', true);
    service.setSessionCookie(
      response,
      token,
      true,
      new Date(Date.now() + day).toISOString(),
    );
    const options = cookie.mock.calls[0]?.[2] as { maxAge: number };
    expect(options.maxAge).toBeGreaterThan(0);
    expect(options.maxAge).toBeLessThanOrEqual(day);
  });

  it('retains existing session cookies and clears either new cookie on sign out', () => {
    const cookie = jest.fn<void, [string, string, Record<string, unknown>]>();
    const clearCookie = jest.fn();
    const response = { cookie, clearCookie } as unknown as Response;
    const service = new AuthCookieService(environment);
    service.setSessionCookie(response, 'legacy-token', true);
    expect(cookie.mock.calls[0]?.[2]).toMatchObject({ maxAge: 365 * day });
    service.clearSessionCookie(response);
    expect(clearCookie).toHaveBeenCalledWith(
      'webhost_session',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('uses a secure host-only cookie in production', () => {
    const cookie = jest.fn<void, [string, string, Record<string, unknown>]>();
    const service = new AuthCookieService({
      ...environment,
      NODE_ENV: 'production',
    });
    service.setSessionCookie(
      { cookie } as unknown as Response,
      administratorSessionToken('random-token', true),
      true,
    );
    expect(cookie).toHaveBeenCalledWith(
      '__Host-webhost_session',
      expect.any(String),
      expect.objectContaining({
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      }),
    );
    expect(cookie.mock.calls[0]?.[2]).not.toHaveProperty('domain');
  });
});
