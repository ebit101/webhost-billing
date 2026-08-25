import { z } from 'zod';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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

const infrastructureEnvironmentSchema = z.object({
  DATABASE_URL: postgresUrlSchema,
  REDIS_URL: redisUrlSchema,
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
    WEB_ORIGIN: z.url().default('http://localhost:3000'),
    API_PUBLIC_ORIGIN: z.url().default('http://localhost:3001'),
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

export const workerEnvironmentSchema = baseEnvironmentSchema
  .extend(infrastructureEnvironmentSchema.shape)
  .extend({
    CREDENTIAL_ENCRYPTION_KEY:
      secretEnvironmentSchema.shape.CREDENTIAL_ENCRYPTION_KEY,
  });

export const webEnvironmentSchema = baseEnvironmentSchema.extend({
  WEB_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  NEXT_PUBLIC_API_URL: z.url().default('http://localhost:3001'),
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
      process.loadEnvFile(absolutePath);
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
