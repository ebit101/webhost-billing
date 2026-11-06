import {
  apiEnvironmentSchema,
  workerEnvironmentSchema,
} from '@webhost-billing/config';
const base = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://fictional:fictional@localhost:5432/fictional',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'fictional-session-secret-only-123456',
  CREDENTIAL_ENCRYPTION_KEY: 'fictional-encryption-key-only-123456',
};
describe('support email activation policy', () => {
  it('defaults API and worker intake to disabled', () => {
    expect(apiEnvironmentSchema.parse(base).SUPPORT_EMAIL_MODE).toBe(
      'disabled',
    );
    expect(workerEnvironmentSchema.parse(base).SUPPORT_EMAIL_MODE).toBe(
      'disabled',
    );
  });
  it('requires an independent delivery secret and reply domain for local or gateway activation', () => {
    for (const schema of [apiEnvironmentSchema, workerEnvironmentSchema]) {
      expect(
        schema.safeParse({ ...base, SUPPORT_EMAIL_MODE: 'local' }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...base,
          SUPPORT_EMAIL_MODE: 'gateway',
          SUPPORT_EMAIL_SECRET: 'x'.repeat(40),
        }).success,
      ).toBe(false);
      expect(
        schema.safeParse({
          ...base,
          SUPPORT_EMAIL_MODE: 'local',
          SUPPORT_EMAIL_SECRET: 'x'.repeat(40),
          SUPPORT_EMAIL_DOMAIN: 'replies.example.test',
        }).success,
      ).toBe(true);
    }
  });
  it('rejects local intake in production at both configuration boundaries', () => {
    for (const schema of [apiEnvironmentSchema, workerEnvironmentSchema]) {
      const result = schema.safeParse({
        ...base,
        NODE_ENV: 'production',
        SUPPORT_EMAIL_MODE: 'local',
        SUPPORT_EMAIL_SECRET: 'x'.repeat(40),
        SUPPORT_EMAIL_DOMAIN: 'replies.example.test',
      });
      expect(result.success).toBe(false);
      if (!result.success)
        expect(
          result.error.issues.some(
            (issue) => issue.path[0] === 'SUPPORT_EMAIL_MODE',
          ),
        ).toBe(true);
    }
  });
});
