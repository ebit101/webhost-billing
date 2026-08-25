import { z } from 'zod';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export const nodeEnvironmentSchema = z.enum([
  'development',
  'test',
  'production',
]);

export const baseEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema.default('development'),
});

export const serverEnvironmentSchema = baseEnvironmentSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535),
});

const postgresUrlSchema = z.string().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'postgres:' || protocol === 'postgresql:';
    } catch {
      return false;
    }
  },
  { message: 'Expected a PostgreSQL connection URL' },
);

const redisUrlSchema = z.string().refine(
  (value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'redis:' || protocol === 'rediss:';
    } catch {
      return false;
    }
  },
  { message: 'Expected a Redis connection URL' },
);

const httpOriginSchema = z.url().refine(
  (value) => {
    const url = new URL(value);
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash
    );
  },
  { message: 'Expected a credential-free HTTP(S) origin without a path' },
);

function isSecureOrLoopbackOrigin(value: string): boolean {
  const url = new URL(value);
  return (
    url.protocol === 'https:' ||
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
  );
}

const infrastructureEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
  BULLMQ_PREFIX: z
    .string()
    .regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)
    .default('webhost-billing'),
});

const secretEnvironmentSchema = z.object({
  SESSION_SECRET: z.string().min(32),
  CREDENTIAL_ENCRYPTION_KEY: z.string().min(32),
});

const environmentBooleanSchema = z.preprocess(
  (value) => (typeof value === 'boolean' ? String(value) : value),
  z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
);

const optionalCredentialSchema = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).max(512).optional(),
);

const apiEnvironmentObjectSchema = serverEnvironmentSchema
  .extend(infrastructureEnvironmentSchema.shape)
  .extend(secretEnvironmentSchema.shape)
  .extend({
    WEB_ORIGIN: httpOriginSchema.default('http://localhost:3000'),
    API_PUBLIC_ORIGIN: httpOriginSchema.default('http://localhost:3001'),
    PAYMENT_PROVIDER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(30_000)
      .default(10_000),
    HOSTING_PANEL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(30_000)
      .default(10_000),
    BKASH_ENABLED: environmentBooleanSchema,
    BKASH_SANDBOX_BASE_URL: z
      .url()
      .default('https://tokenized.sandbox.bka.sh/v1.2.0-beta'),
    BKASH_APP_KEY: optionalCredentialSchema,
    BKASH_APP_SECRET: optionalCredentialSchema,
    BKASH_USERNAME: optionalCredentialSchema,
    BKASH_PASSWORD: optionalCredentialSchema,
    SSLCOMMERZ_ENABLED: environmentBooleanSchema,
    SSLCOMMERZ_STORE_ID: optionalCredentialSchema,
    SSLCOMMERZ_STORE_PASSWORD: optionalCredentialSchema,
    SESSION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(900)
      .max(2_592_000)
      .default(604_800),
    PASSWORD_RESET_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(86_400)
      .default(3_600),
    EMAIL_VERIFICATION_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(900)
      .max(604_800)
      .default(86_400),
    AUTH_RATE_LIMIT_NAMESPACE: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/)
      .default('default'),
  });

function requireCredential(
  value: string | undefined,
  path: string,
  context: z.RefinementCtx,
): void {
  if (!value) {
    context.addIssue({
      code: 'custom',
      path: [path],
      message: `${path} is required when its payment provider is enabled`,
    });
  }
}

export const apiEnvironmentSchema = apiEnvironmentObjectSchema.superRefine(
  (environment, context) => {
    if (environment.NODE_ENV === 'production') {
      for (const key of ['WEB_ORIGIN', 'API_PUBLIC_ORIGIN'] as const) {
        if (!isSecureOrLoopbackOrigin(environment[key])) {
          context.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} must use HTTPS in production`,
          });
        }
      }
      if (
        environment.SESSION_SECRET.length < 48 ||
        environment.CREDENTIAL_ENCRYPTION_KEY.length < 48 ||
        environment.SESSION_SECRET === environment.CREDENTIAL_ENCRYPTION_KEY ||
        environment.SESSION_SECRET.startsWith('replace-') ||
        environment.CREDENTIAL_ENCRYPTION_KEY.startsWith('replace-')
      ) {
        context.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message:
            'Production session and encryption secrets must be distinct, randomly generated values of at least 48 characters',
        });
      }
    }
    if (environment.BKASH_ENABLED || environment.SSLCOMMERZ_ENABLED) {
      const callbackOrigin = new URL(environment.API_PUBLIC_ORIGIN);
      if (
        callbackOrigin.protocol !== 'https:' ||
        callbackOrigin.username ||
        callbackOrigin.password ||
        callbackOrigin.pathname !== '/' ||
        callbackOrigin.search ||
        callbackOrigin.hash
      ) {
        context.addIssue({
          code: 'custom',
          path: ['API_PUBLIC_ORIGIN'],
          message:
            'API_PUBLIC_ORIGIN must be a credential-free HTTPS origin when a payment provider is enabled',
        });
      }
    }
    if (environment.BKASH_ENABLED) {
      requireCredential(environment.BKASH_APP_KEY, 'BKASH_APP_KEY', context);
      requireCredential(
        environment.BKASH_APP_SECRET,
        'BKASH_APP_SECRET',
        context,
      );
      requireCredential(environment.BKASH_USERNAME, 'BKASH_USERNAME', context);
      requireCredential(environment.BKASH_PASSWORD, 'BKASH_PASSWORD', context);
      try {
        const baseUrl = new URL(environment.BKASH_SANDBOX_BASE_URL);
        if (
          baseUrl.toString() !== 'https://tokenized.sandbox.bka.sh/v1.2.0-beta'
        ) {
          context.addIssue({
            code: 'custom',
            path: ['BKASH_SANDBOX_BASE_URL'],
            message: 'bKash must use the pinned official sandbox base URL',
          });
        }
      } catch {
        // The URL schema reports the malformed value.
      }
    }
    if (environment.SSLCOMMERZ_ENABLED) {
      requireCredential(
        environment.SSLCOMMERZ_STORE_ID,
        'SSLCOMMERZ_STORE_ID',
        context,
      );
      requireCredential(
        environment.SSLCOMMERZ_STORE_PASSWORD,
        'SSLCOMMERZ_STORE_PASSWORD',
        context,
      );
    }
  },
);

const emailHeaderValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((value) => !/[\r\n]/.test(value), {
    message: 'Email header values cannot contain line breaks',
  });

const workerEnvironmentObjectSchema = baseEnvironmentSchema
  .extend(infrastructureEnvironmentSchema.shape)
  .extend({
    CREDENTIAL_ENCRYPTION_KEY:
      secretEnvironmentSchema.shape.CREDENTIAL_ENCRYPTION_KEY,
    OUTBOX_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(1_000),
    OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(25),
    OUTBOX_LOCK_TIMEOUT_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .max(3_600)
      .default(120),
    SCHEDULER_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(86_400_000)
      .default(60_000),
    HOSTING_PANEL_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(30_000)
      .default(10_000),
    EMAIL_TRANSPORT: z.enum(['preview', 'smtp']).default('preview'),
    EMAIL_PUBLIC_WEB_URL: httpOriginSchema.default('http://localhost:3000'),
    EMAIL_BRAND_NAME: emailHeaderValueSchema.default('Webhost Billing'),
    EMAIL_BRAND_COLOR: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .default('#0891b2'),
    EMAIL_FROM_ADDRESS: z.email().max(320).default('no-reply@example.test'),
    EMAIL_FROM_NAME: emailHeaderValueSchema.default('Webhost Billing'),
    EMAIL_REPLY_TO_ADDRESS: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.email().max(320).optional(),
    ),
    EMAIL_PREVIEW_DIRECTORY: z
      .string()
      .min(1)
      .default('/tmp/webhost-billing-email-preview'),
    EMAIL_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
    SMTP_HOST: optionalCredentialSchema,
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: environmentBooleanSchema,
    SMTP_REQUIRE_TLS: z.preprocess(
      (value) => (typeof value === 'boolean' ? String(value) : value),
      z
        .enum(['true', 'false'])
        .default('true')
        .transform((value) => value === 'true'),
    ),
    SMTP_USERNAME: optionalCredentialSchema,
    SMTP_PASSWORD: optionalCredentialSchema,
    SMTP_CONNECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(30_000)
      .default(10_000),
    SMTP_SOCKET_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(5_000)
      .max(120_000)
      .default(30_000),
  });

export const workerEnvironmentSchema =
  workerEnvironmentObjectSchema.superRefine((environment, context) => {
    const publicUrl = new URL(environment.EMAIL_PUBLIC_WEB_URL);
    if (
      publicUrl.username ||
      publicUrl.password ||
      publicUrl.search ||
      publicUrl.hash
    ) {
      context.addIssue({
        code: 'custom',
        path: ['EMAIL_PUBLIC_WEB_URL'],
        message:
          'EMAIL_PUBLIC_WEB_URL must not contain credentials, query, or fragment',
      });
    }
    if (environment.NODE_ENV === 'production') {
      if (environment.EMAIL_TRANSPORT !== 'smtp') {
        context.addIssue({
          code: 'custom',
          path: ['EMAIL_TRANSPORT'],
          message: 'Production email delivery must use SMTP',
        });
      }
      if (publicUrl.protocol !== 'https:') {
        context.addIssue({
          code: 'custom',
          path: ['EMAIL_PUBLIC_WEB_URL'],
          message: 'Production email links must use HTTPS',
        });
      }
      if (!environment.SMTP_SECURE && !environment.SMTP_REQUIRE_TLS) {
        context.addIssue({
          code: 'custom',
          path: ['SMTP_REQUIRE_TLS'],
          message: 'Production SMTP must use implicit TLS or require STARTTLS',
        });
      }
    }
    if (environment.EMAIL_TRANSPORT === 'smtp' && !environment.SMTP_HOST) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_HOST'],
        message: 'SMTP_HOST is required when SMTP delivery is enabled',
      });
    }
    if (
      Boolean(environment.SMTP_USERNAME) !== Boolean(environment.SMTP_PASSWORD)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'SMTP username and password must be configured together',
      });
    }
  });

export const webEnvironmentSchema = baseEnvironmentSchema
  .extend({
    WEB_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    NEXT_PUBLIC_API_URL: httpOriginSchema.default('http://localhost:3001'),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      !isSecureOrLoopbackOrigin(environment.NEXT_PUBLIC_API_URL)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['NEXT_PUBLIC_API_URL'],
        message: 'NEXT_PUBLIC_API_URL must use HTTPS in production',
      });
    }
  });

export type BaseEnvironment = z.infer<typeof baseEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type WebEnvironment = z.infer<typeof webEnvironmentSchema>;

export function loadEnvironmentFiles(
  paths: readonly string[] = ['.env', '../../.env'],
): void {
  for (const path of paths) {
    const absolutePath = resolve(process.cwd(), path);

    if (existsSync(absolutePath)) {
      const values = parseEnv(readFileSync(absolutePath, 'utf8'));
      for (const [key, value] of Object.entries(values)) {
        if (process.env[key] === undefined) process.env[key] = value;
      }
      return;
    }
  }
}

export function parseBaseEnvironment(
  environment: NodeJS.ProcessEnv,
): BaseEnvironment {
  return baseEnvironmentSchema.parse(environment);
}

export function parseServerEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}

export function parseApiEnvironment(
  environment: NodeJS.ProcessEnv,
): ApiEnvironment {
  return apiEnvironmentSchema.parse(environment);
}

export function parseWorkerEnvironment(
  environment: NodeJS.ProcessEnv,
): WorkerEnvironment {
  return workerEnvironmentSchema.parse(environment);
}

export function parseWebEnvironment(
  environment: NodeJS.ProcessEnv,
): WebEnvironment {
  return webEnvironmentSchema.parse(environment);
}
