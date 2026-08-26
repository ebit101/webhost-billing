import { loadEnvironmentFiles } from '@webhost-billing/config';

export const E2E_SCHEMA = 'command26_e2e';
export const E2E_WEB_ORIGIN = 'http://127.0.0.1:3200';
export const E2E_API_ORIGIN = 'http://127.0.0.1:3201';

loadEnvironmentFiles();

const configuredDatabaseUrl = process.env.DATABASE_URL;
if (!configuredDatabaseUrl) {
  throw new Error('DATABASE_URL is required for the isolated browser tests.');
}

const databaseUrl = new URL(configuredDatabaseUrl);
databaseUrl.searchParams.set('schema', E2E_SCHEMA);

const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

export const E2E_DATABASE_URL = databaseUrl.toString();
export const E2E_SESSION_SECRET =
  'command26-e2e-session-secret-for-fictional-tests-only';
export const E2E_ENCRYPTION_KEY =
  'command26-e2e-encryption-key-for-fictional-tests-only';

export const e2eApiEnvironment: Record<string, string> = {
  ...inheritedEnvironment,
  NODE_ENV: 'test',
  API_PORT: '3201',
  DATABASE_URL: E2E_DATABASE_URL,
  WEB_ORIGIN: E2E_WEB_ORIGIN,
  API_PUBLIC_ORIGIN: E2E_API_ORIGIN,
  SESSION_SECRET: E2E_SESSION_SECRET,
  CREDENTIAL_ENCRYPTION_KEY: E2E_ENCRYPTION_KEY,
  AUTH_RATE_LIMIT_NAMESPACE: `command26_${process.pid}`,
  BULLMQ_PREFIX: `command26_${process.pid}`,
  EMAIL_PUBLIC_WEB_URL: E2E_WEB_ORIGIN,
  EMAIL_PREVIEW_DIRECTORY: `/tmp/webhost-billing-command26-${process.pid}`,
};

export const e2eWebEnvironment: Record<string, string> = {
  ...inheritedEnvironment,
  NODE_ENV: 'development',
  WEB_PORT: '3200',
  NEXT_PUBLIC_API_URL: E2E_API_ORIGIN,
  NEXT_DIST_DIR: '.next-e2e',
};
