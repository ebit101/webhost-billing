import { expect, test } from '@playwright/test';
import { e2ePrisma } from '../database';
import {
  assertBrowserDatabaseScope,
  validateBrowserDatabaseUrl,
} from '../database-scope';
import { E2E_DATABASE_URL, E2E_SCHEMA } from '../environment';

test.afterAll(async () => e2ePrisma.$disconnect());

test('browser clients share a marked fictional model and raw-SQL scope', async () => {
  await assertBrowserDatabaseScope(e2ePrisma, E2E_DATABASE_URL, E2E_SCHEMA);
  const target = new URL(E2E_DATABASE_URL);
  target.searchParams.set('options', '-csearch_path=public');
  expect(() =>
    validateBrowserDatabaseUrl(target.toString(), E2E_SCHEMA),
  ).toThrow('must match exactly');
  target.searchParams.set('schema', 'public');
  expect(() =>
    validateBrowserDatabaseUrl(target.toString(), E2E_SCHEMA),
  ).toThrow('must match exactly');
});
