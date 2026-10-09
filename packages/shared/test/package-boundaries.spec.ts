import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

describe('shared package boundaries', () => {
  it('keeps selection request syntax separate, pure and unused by runtime consumers', async () => {
    const [manifestText, rootEntry, source] = await Promise.all([
      readFile(resolve(__dirname, '../package.json'), 'utf8'),
      readFile(resolve(__dirname, '../src/index.ts'), 'utf8'),
      readFile(
        resolve(__dirname, '../src/currency-selection-request.ts'),
        'utf8',
      ),
    ]);
    const manifest = JSON.parse(manifestText) as {
      exports: Record<string, { default: string; types: string }>;
    };
    assert.deepEqual(manifest.exports['./currency-selection-request'], {
      types: './src/currency-selection-request.ts',
      default: './dist/currency-selection-request.js',
    });
    assert.doesNotMatch(
      rootEntry,
      /currency-selection-request|parseCurrencySelectionRequest/,
    );
    assert.deepEqual(manifest.exports['.'], {
      types: './src/index.ts',
      default: './dist/index.js',
    });
    assert.deepEqual(
      [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map((match) => match[1]),
      ['zod', './currency-policy'],
    );
    assert.doesNotMatch(
      source,
      /process\.|Date\.|new Date|fetch\(|node:|console\.|random|createHash/,
    );
    const consumers = spawnSync(
      'git',
      [
        'grep',
        '-n',
        '-E',
        'currency-selection-request|parseCurrencySelectionRequest',
        '--',
        'apps',
        'packages/database/src',
        'packages/queue/src',
        'scripts',
      ],
      {
        cwd: resolve(__dirname, '../../..'),
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 64 * 1024,
        windowsHide: true,
      },
    );
    assert.equal(
      consumers.error,
      undefined,
      'Consumer inventory could not run',
    );
    assert.equal(
      consumers.status,
      1,
      'Unexpected runtime selection request consumer',
    );
    assert.ok(
      consumers.stdout === '' && consumers.stderr === '',
      'Unexpected consumer inventory output',
    );
  });

  it('keeps unused currency policy behind a separate entry point', async () => {
    const [manifestText, rootEntry] = await Promise.all([
      readFile(resolve(__dirname, '../package.json'), 'utf8'),
      readFile(resolve(__dirname, '../src/index.ts'), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText) as {
      exports: Record<string, { default: string; types: string }>;
    };
    assert.deepEqual(manifest.exports['./currency-policy'], {
      types: './src/currency-policy.ts',
      default: './dist/currency-policy.js',
    });
    assert.doesNotMatch(rootEntry, /currency-policy/);
    assert.deepEqual(manifest.exports['.'], {
      types: './src/index.ts',
      default: './dist/index.js',
    });
  });

  it('keeps unused currency arithmetic behind a separate entry point', async () => {
    const [manifestText, rootEntry] = await Promise.all([
      readFile(resolve(__dirname, '../package.json'), 'utf8'),
      readFile(resolve(__dirname, '../src/index.ts'), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText) as {
      exports: Record<string, { default: string; types: string }>;
    };
    assert.deepEqual(manifest.exports['./currency-arithmetic'], {
      types: './src/currency-arithmetic.ts',
      default: './dist/currency-arithmetic.js',
    });
    assert.doesNotMatch(rootEntry, /currency-arithmetic/);
    assert.deepEqual(manifest.exports['.'], {
      types: './src/index.ts',
      default: './dist/index.js',
    });
  });

  it('keeps Node-only observability out of the browser-compatible root entry', async () => {
    const [manifestText, rootEntry] = await Promise.all([
      readFile(resolve(__dirname, '../package.json'), 'utf8'),
      readFile(resolve(__dirname, '../src/index.ts'), 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText) as {
      exports: Record<string, { default: string; types: string }>;
    };

    assert.deepEqual(manifest.exports['./observability'], {
      types: './src/observability.ts',
      default: './dist/observability.js',
    });
    assert.doesNotMatch(rootEntry, /['"]\.\/observability['"]/);
  });
});
