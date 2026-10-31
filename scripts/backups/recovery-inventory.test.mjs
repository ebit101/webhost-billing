import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const common = readFileSync(new URL('scripts/backups/common.sh', root), 'utf8');
const schema = readFileSync(
  new URL('packages/database/prisma/schema.prisma', root),
  'utf8',
);
const verifier = readFileSync(
  new URL('packages/database/prisma/verify.ts', root),
  'utf8',
);
const array = common.match(/BACKUP_REQUIRED_TABLES=\(\s*([\s\S]*?)\n\)/)?.[1];
assert.ok(array, 'Recovery inventory must be present');
const inventory = array.trim().split(/\s+/);

test('recovery requires every mapped model, including newer billing and domain history', () => {
  const tables = ['_prisma_migrations'];
  for (const model of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const mapping = model[2].match(/@@map\("([a-z0-9_]+)"\)/);
    assert.ok(
      mapping,
      `${model[1]} needs an explicit recovery inventory mapping`,
    );
    tables.push(mapping[1]);
  }
  assert.ok(tables.length > 30);
  assert.equal(inventory.length, new Set(inventory).size);
  assert.deepEqual([...inventory].sort(), tables.sort());
  assert.ok(inventory.includes('existing_domain_orders'));
  assert.ok(inventory.includes('notification_entries'));
});

test('recovery and the database verifier agree on the entire application table set', () => {
  const expected = verifier.match(
    /const expectedTables = \[([\s\S]*?)\] as const;/,
  )?.[1];
  assert.ok(expected);
  const tables = [...expected.matchAll(/'([a-z0-9_]+)'/g)].map(
    (match) => match[1],
  );
  assert.deepEqual(
    inventory.filter((name) => name !== '_prisma_migrations').sort(),
    tables.sort(),
  );
});

test('all current migration sources satisfy the recovery history naming boundary', () => {
  const migrations = new URL('packages/database/prisma/migrations/', root);
  const folders = readdirSync(migrations, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  );
  assert.ok(folders.length >= 39);
  for (const folder of folders) {
    assert.match(folder.name, /^[0-9]{14}_[a-z0-9_]+$/);
    assert.ok(
      readFileSync(new URL(`${folder.name}/migration.sql`, migrations)).length >
        0,
    );
  }
});

const checksum = (value) => createHash('sha256').update(value).digest('hex');
const checksumFixtures = [
  ['LF', 'SELECT 1;\n'],
  ['CRLF', 'SELECT 1;\r\n'],
  ['mixed line endings', 'SELECT 1;\r\nSELECT 2;\n'],
  ['no final newline', 'SELECT 1;'],
  ['lone carriage return and Unicode', "SELECT 'বাংলা\rvalue';"],
];

for (const [label, sql] of checksumFixtures) {
  test(`migration checksum variants preserve SQL bytes: ${label}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'webhost-recovery-checksum-'));
    const path = join(directory, 'migration.sql');
    try {
      writeFileSync(path, sql, { mode: 0o600 });
      const bash =
        process.env.BACKUP_TEST_BASH ??
        (process.platform === 'win32'
          ? 'C:/Program Files/Git/bin/bash.exe'
          : 'bash');
      const helper = fileURLToPath(
        new URL('scripts/backups/migration-checksums.sh', root),
      ).replaceAll('\\', '/');
      const result = spawnSync(
        bash,
        [
          '-c',
          'set -euo pipefail; source "$1"; backup_migration_checksums "$2"',
          '--',
          helper,
          path.replaceAll('\\', '/'),
        ],
        { encoding: 'utf8', env: { ...process.env, BASH_ENV: '' } },
      );
      assert.equal(result.status, 0, result.stderr || String(result.error));
      const allowed = result.stdout.trim().split('|');
      const lf = sql.replaceAll('\r\n', '\n');
      assert.deepEqual(allowed, [
        checksum(sql),
        checksum(lf),
        checksum(lf.replaceAll('\n', '\r\n')),
      ]);
      assert.ok(!allowed.includes(checksum(`${sql}-- changed SQL`)));
      if (!sql.endsWith('\n'))
        assert.ok(!allowed.includes(checksum(`${sql}\n`)));
    } finally {
      unlinkSync(path);
      rmdirSync(directory);
    }
  });
}
