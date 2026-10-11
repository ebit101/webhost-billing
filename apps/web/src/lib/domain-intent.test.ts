import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { domainEntryHref, readDomainIntent } from './domain-intent';
test('only validated offer and canonical domain cross sign-in, never price/contact/redirect authority', () => {
  const id = '50000000-0000-4000-8000-000000000001';
  const query = new URLSearchParams({
    domainOfferId: id,
    domainName: 'Fictional.COM',
    redirect: 'https://example.invalid',
    sellingAmount: '0',
  });
  expect(readDomainIntent(query)).toEqual({
    domainOfferId: id,
    domainName: 'fictional.com',
  });
  expect(domainEntryHref('/login', readDomainIntent(query))).toBe(
    `/login?domainOfferId=${id}&domainName=fictional.com`,
  );
  query.append('domainName', 'different.com');
  expect(readDomainIntent(query)).toBeUndefined();
  expect(
    readDomainIntent({ domainOfferId: id, domainName: 'xn--example.com' }),
  ).toBeUndefined();
});
test('clean-build prerequisites retain the queue manifest and compiled API type imports', () => {
  const docker = readFileSync(resolve('Dockerfile.dev'), 'utf8');
  expect(
    docker.indexOf(
      'COPY packages/queue/package.json packages/queue/package.json',
    ),
  ).toBeGreaterThan(0);
  expect(docker.indexOf('COPY packages/queue/package.json')).toBeLessThan(
    docker.indexOf('RUN pnpm install --frozen-lockfile'),
  );
  const workflow = readFileSync(
    resolve('../../.github/workflows/ci.yml'),
    'utf8',
  );
  expect(
    workflow.indexOf('pnpm --filter @webhost-billing/api build'),
  ).toBeGreaterThan(0);
  expect(
    workflow.indexOf('pnpm --filter @webhost-billing/api build'),
  ).toBeLessThan(workflow.indexOf('run: pnpm typecheck'));
});
