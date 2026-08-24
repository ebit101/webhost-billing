import { Test } from '@nestjs/testing';
import { apiEnvironmentSchema } from '@webhost-billing/config';
import { API_ENVIRONMENT } from '../../../infrastructure/environment/environment.module';
import { REDIS_CLIENT } from '../../../infrastructure/redis/redis.module';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { CsrfService } from './csrf.service';
import { PasswordHasherService } from './password-hasher.service';
import { TokenCipherService } from './token-cipher.service';

const environment = apiEnvironmentSchema.parse({
  NODE_ENV: 'test',
  PORT: 3001,
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:5432/test',
  REDIS_URL: 'redis://127.0.0.1:6379/0',
  SESSION_SECRET: 'test-session-secret-at-least-32-characters',
  CREDENTIAL_ENCRYPTION_KEY: 'test-encryption-key-at-least-32-characters',
  AUTH_RATE_LIMIT_NAMESPACE: 'unit-test',
});

describe('authentication security services', () => {
  it('generates signed CSRF tokens and rejects tampering', () => {
    const service = new CsrfService(environment);
    const token = service.generate();
    const replacement = token.endsWith('0') ? '1' : '0';

    expect(service.validate(token)).toBe(true);
    expect(service.validate(`${token.slice(0, -1)}${replacement}`)).toBe(false);
    expect(service.validate('malformed')).toBe(false);
  });

  it('encrypts token delivery material with authenticated encryption', () => {
    const service = new TokenCipherService(environment);
    const token = 'single-use-token-that-must-not-be-stored-in-plaintext';
    const ciphertext = service.encrypt(token);

    expect(ciphertext).not.toContain(token);
    expect(service.decrypt(ciphertext)).toBe(token);
    expect(() => service.decrypt(`${ciphertext}.tampered`)).toThrow();
  });

  it('hashes passwords with Argon2id and verifies without plaintext storage', async () => {
    const service = new PasswordHasherService();
    const password = 'correct horse battery staple';
    const passwordHash = await service.hash(password);

    expect(passwordHash.startsWith('$argon2id$')).toBe(true);
    await expect(service.verify(passwordHash, password)).resolves.toBe(true);
    await expect(service.verify(passwordHash, 'wrong password')).resolves.toBe(
      false,
    );
  });

  it('returns the stable rate-limit error after the configured limit', async () => {
    const redis = { eval: jest.fn().mockResolvedValue(6) };
    const moduleFixture = await Test.createTestingModule({
      providers: [
        AuthRateLimitService,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: API_ENVIRONMENT, useValue: environment },
      ],
    }).compile();
    const service = moduleFixture.get(AuthRateLimitService);

    await expect(
      service.consume({
        scope: 'login',
        fingerprint: '127.0.0.1:customer@example.test',
        limit: 5,
        windowMs: 900_000,
      }),
    ).rejects.toMatchObject({
      code: 'RATE_LIMITED',
    });
  });
});
