import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createServerRequestSchema,
  updateServerRequestSchema,
} from '../src/contracts/servers';

const common = { name: 'Fictional node', hostname: 'node.example.test' };
test('server types require their own complete credentials and approved ports', () => {
  const vps = {
    ...common,
    serverType: 'VIRTUALIZOR',
    credentials: { apiKey: 'fictional-key', apiPassword: 'fictional-pass' },
  };
  assert.equal(createServerRequestSchema.parse(vps).port, 4085);
  for (const invalid of [
    { ...vps, credentials: { apiKey: 'key' } },
    { ...vps, port: 4084 },
    { ...vps, apiUsername: 'root' },
    { ...vps, credentials: { ...vps.credentials, apiPassword: 'bad\npass' } },
    { ...vps, serverType: 'UNKNOWN' },
  ])
    assert.equal(createServerRequestSchema.safeParse(invalid).success, false);
  assert.equal(
    createServerRequestSchema.parse({
      ...common,
      serverType: 'SHOUTCAST',
      port: 8443,
      credentials: { adminPassword: 'fictional' },
    }).port,
    8443,
  );
  assert.equal(
    createServerRequestSchema.parse({
      name: 'Fictional cloud',
      serverType: 'VULTR',
      credentials: { apiKey: 'fictional' },
    }).hostname,
    'api.vultr.com',
  );
  assert.equal(
    createServerRequestSchema.safeParse({
      ...common,
      serverType: 'VULTR',
      credentials: { apiKey: 'fictional' },
    }).success,
    false,
  );
});
test('new provider edits retain credentials when omitted, reject partial pairs and cannot activate', () => {
  assert.equal(
    updateServerRequestSchema.safeParse({
      serverType: 'VIRTUALIZOR',
      name: 'Renamed',
    }).success,
    true,
  );
  for (const update of [
    { serverType: 'VIRTUALIZOR', credentials: { apiKey: 'replacement' } },
    { serverType: 'VIRTUALIZOR', status: 'ACTIVE' },
    { serverType: 'VULTR', apiToken: 'wrong provider' },
    { serverType: 'SHOUTCAST', status: 'MAINTENANCE' },
  ])
    assert.equal(updateServerRequestSchema.safeParse(update).success, false);
});
test('legacy cPanel request shapes remain supported', () => {
  assert.equal(
    createServerRequestSchema.parse({
      ...common,
      apiUsername: 'reseller',
      apiToken: 'FictionalTokenValue1234567890',
    }).port,
    2087,
  );
  assert.equal(
    updateServerRequestSchema.safeParse({ status: 'ACTIVE' }).success,
    true,
  );
});
test('partial provider updates never inject create defaults', () => {
  for (const serverType of ['VIRTUALIZOR', 'VULTR', 'SHOUTCAST']) {
    assert.deepEqual(
      updateServerRequestSchema.parse({ serverType, name: 'Renamed' }),
      { serverType, name: 'Renamed' },
    );
  }
});
