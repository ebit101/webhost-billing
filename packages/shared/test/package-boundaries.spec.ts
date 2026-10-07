import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

describe('shared package boundaries', () => {
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
