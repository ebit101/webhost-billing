import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import test from 'node:test';

assert.equal(
  process.env.WEBHOST_DEPLOYMENT_COMMAND230_CONTAINER,
  'fictional-command230',
);
assert.equal(process.platform, 'linux');
assert.ok(existsSync('/.dockerenv'));
const base = '/srv/webhost-billing-staging';
const sha = '2'.repeat(40);
const oldSha = '1'.repeat(40);
const source = '/repo/deploy/staging/deploy-release.sh';

function fixture(scenario) {
  assert.equal(existsSync(base), false, 'Do not overwrite another fixture.');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, '.command230-owner'), 'fictional-command230');
  for (const p of [
    'incoming',
    'rollback',
    'secrets',
    'mocks',
    `releases/${oldSha}/scripts/backups`,
    'archive/deploy/staging',
  ])
    mkdirSync(join(base, p), { recursive: true });
  const old = join(base, 'releases', oldSha);
  symlinkSync(old, join(base, 'current'));
  const logo = 'apps/web/public/branding/speed-host-logo.png';
  mkdirSync(join(old, 'apps/web/public/branding'), { recursive: true });
  writeFileSync(join(old, logo), 'fictional-logo');
  writeFileSync(
    join(base, '.env.staging'),
    `IMAGE_TAG=${oldSha}\nRESELLBIZ_LIVE_ENABLED=false\nNEXT_PUBLIC_BRAND_LOGO_PATH=/branding/speed-host-logo.png\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    join(old, 'scripts/backups/create-postgres-backup.sh'),
    '#!/bin/bash\necho /fictional/verified.dump.gpg\n',
  );
  writeFileSync(
    join(old, 'scripts/backups/verify-postgres-backup.sh'),
    '#!/bin/bash\n[[ "$SCENARIO" != backup-fails ]]\n',
  );
  cpSync(source, join(base, 'archive/deploy/staging/deploy-release.sh'));
  const archive = join(base, 'incoming', `webhost-staging-${sha}.tar.gz`);
  assert.equal(
    spawnSync('tar', ['-czf', archive, '-C', join(base, 'archive'), '.'])
      .status,
    0,
  );
  const digest = createHash('sha256')
    .update(readFileSync(archive))
    .digest('hex');
  const mock = (name, body) =>
    writeFileSync(join(base, 'mocks', name), '#!/bin/bash\nset -eu\n' + body, {
      mode: 0o755,
    });
  mock(
    'docker',
    `printf '%s\\n' "$*" >> '${base}/calls'\ncase "$*" in
    *' config --quiet') exit 0;;
    *' ps --format json') echo '{}';;
    *' build '*) exit 0;;
    *' stop api worker scheduler') [[ "$SCENARIO" != stop-fails ]];;
    *' run --rm --no-deps migrate')
      if [[ "$SCENARIO" == interrupted ]]; then echo '47 applied' > '${base}/migration-effects'; kill -TERM "$PPID"; exit 0; fi
      if [[ "$SCENARIO" == migration-fails ]]; then echo '47 applied, 48 failed' > '${base}/migration-effects'; exit 9; fi
      [[ "$SCENARIO" != early-migration-fails ]] || exit 9
      echo '58 applied' > '${base}/migration-effects';;
    *' exec -T postgres '*) [[ "$SCENARIO" != ledger-query-fails ]] || exit 7; if [[ "$SCENARIO" == unfinished-ledger ]]; then echo 1; else echo 0; fi;;
    *' up -d --no-deps --force-recreate --wait api web worker scheduler') [[ "$SCENARIO" != start-fails ]];;
    *' exec -T '*' printenv RESELLBIZ_LIVE_ENABLED') echo false;;
    *) echo 'Unexpected docker command' >&2; exit 80;;
  esac\n`,
  );
  mock(
    'jq',
    `cat >/dev/null\nif [[ "$*" == *'length == 7'* ]]; then
    if [[ "$SCENARIO" == health-fails && -f '${base}/migration-effects' ]]; then exit 1; fi
    exit 0
  fi\necho fictional-infrastructure-id\n`,
  );
  mock('curl', 'exit 0\n');
  mock('node', 'exit 0\n');
  mock(
    'mktemp',
    '[[ "$SCENARIO" != env-write-fails ]] || exit 8\nexec /usr/bin/mktemp "$@"\n',
  );
  mock(
    'mv',
    `if [[ "$SCENARIO" == switch-fails && "$3" == '${base}/current' ]]; then exit 8; fi\nexec /bin/mv "$@"\n`,
  );
  const run = () =>
    spawnSync('bash', [source, sha, digest], {
      encoding: 'utf8',
      timeout: 20000,
      env: {
        ...process.env,
        SCENARIO: scenario,
        PATH: `${base}/mocks:${process.env.PATH}`,
      },
    });
  return {
    run,
    old,
    cleanup() {
      assert.equal(realpathSync(base), base);
      assert.equal(
        readFileSync(join(base, '.command230-owner'), 'utf8'),
        'fictional-command230',
      );
      rmSync(base, { recursive: true });
    },
  };
}

test('successful release starts matching writers only after migration and clears its hold', () => {
  const f = fixture('success');
  try {
    const result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(join(base, 'calls'), 'utf8');
    assert.ok(
      calls.indexOf('stop api worker scheduler') <
        calls.indexOf('run --rm --no-deps migrate'),
    );
    assert.ok(
      calls.indexOf('run --rm --no-deps migrate') < calls.indexOf('up -d'),
    );
    assert.equal(
      realpathSync(join(base, 'current')),
      join(base, 'releases', sha),
    );
    assert.equal(existsSync(join(base, 'deployment-held')), false);
    assert.equal((calls.match(/ up -d /g) ?? []).length, 1);
  } finally {
    f.cleanup();
  }
});

test('backup failure leaves old writers and release untouched before the migration boundary', () => {
  const f = fixture('backup-fails');
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(base, 'deployment-held')), false);
    assert.equal(existsSync(join(base, 'migration-effects')), false);
    assert.equal(realpathSync(join(base, 'current')), f.old);
    const calls = readFileSync(join(base, 'calls'), 'utf8');
    assert.ok(
      !calls.includes(' stop ') &&
        !calls.includes(' up ') &&
        !calls.includes(' run '),
    );
  } finally {
    f.cleanup();
  }
});

test('process interruption retains an in-progress hold and blocks blind replay', () => {
  const f = fixture('interrupted');
  try {
    const result = f.run();
    assert.notEqual(result.status, 0);
    const hold = readFileSync(join(base, 'deployment-held'), 'utf8');
    assert.ok(hold.includes('status=in-progress'));
    assert.ok(!readFileSync(join(base, 'calls'), 'utf8').includes(' up '));
    assert.equal(
      readFileSync(join(base, 'migration-effects'), 'utf8').trim(),
      '47 applied',
    );
    const retry = f.run();
    assert.notEqual(retry.status, 0);
    assert.match(retry.stderr, /operator recovery decision/);
    assert.equal(readFileSync(join(base, 'deployment-held'), 'utf8'), hold);
  } finally {
    f.cleanup();
  }
});

for (const scenario of [
  'migration-fails',
  'early-migration-fails',
  'unfinished-ledger',
  'ledger-query-fails',
  'env-write-fails',
  'switch-fails',
  'start-fails',
  'health-fails',
  'stop-fails',
]) {
  test(`${scenario} retains a recovery hold and never automatically starts old writers`, () => {
    const f = fixture(scenario);
    try {
      const result = f.run();
      assert.notEqual(result.status, 0, result.stdout);
      const hold = readFileSync(join(base, 'deployment-held'), 'utf8');
      assert.ok(hold.includes('status=held'), result.stderr);
      assert.ok(hold.includes(`candidate_commit=${sha}`));
      assert.ok(
        hold.includes(
          `writers_stop_status=${scenario === 'stop-fails' ? 1 : 0}`,
        ),
      );
      const calls = readFileSync(join(base, 'calls'), 'utf8');
      const ups = calls.split('\n').filter((l) => l.includes(' up '));
      assert.ok(
        ups.every((l) =>
          l.includes('--force-recreate --wait api web worker scheduler'),
        ),
      );
      assert.equal(
        ups.length,
        ['start-fails', 'health-fails'].includes(scenario) ? 1 : 0,
      );
      assert.ok(calls.trimEnd().endsWith('stop api worker scheduler'));
      if (scenario === 'migration-fails')
        assert.equal(
          readFileSync(join(base, 'migration-effects'), 'utf8').trim(),
          '47 applied, 48 failed',
        );
      if (!['start-fails', 'health-fails'].includes(scenario))
        assert.equal(realpathSync(join(base, 'current')), f.old);
      if (
        [
          'migration-fails',
          'unfinished-ledger',
          'ledger-query-fails',
          'env-write-fails',
          'early-migration-fails',
          'stop-fails',
        ].includes(scenario)
      )
        assert.ok(
          readFileSync(join(base, '.env.staging'), 'utf8').includes(
            `IMAGE_TAG=${oldSha}`,
          ),
        );
      const before = calls;
      const retry = f.run();
      assert.notEqual(retry.status, 0);
      assert.match(retry.stderr, /operator recovery decision/);
      assert.equal(
        readFileSync(join(base, 'calls'), 'utf8'),
        before,
        'Retry must not invoke Docker.',
      );
      assert.equal(readFileSync(join(base, 'deployment-held'), 'utf8'), hold);
    } finally {
      f.cleanup();
    }
  });
}
