import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  checkDemoScreenshotAssets,
  demoScreenshotAssetContract,
  formatDemoScreenshotAssetReport,
  runDemoScreenshotAssetCheck,
} from './check-demo-screenshot-assets.mjs';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const currentContract = JSON.parse(
  readFileSync(
    join(repositoryRoot, demoScreenshotAssetContract.contractPath),
    'utf8',
  ),
);

function cloneContract() {
  return structuredClone(currentContract);
}

function metadata(type, size = 50_000) {
  return {
    isDirectory: () => type === 'directory',
    isFile: () => type === 'file',
    isSymbolicLink: () => type === 'symlink',
    size,
  };
}

function missingError() {
  return Object.assign(new Error('UNTRUSTED_PATH_DETAIL'), { code: 'ENOENT' });
}

function pngHeader(width, height) {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function createFixture(options = {}) {
  const root = resolve('fixture', 'repository');
  const contract = options.contract ?? cloneContract();
  const assetDirectory = join(root, 'docs', 'assets', 'demo');
  const entries = new Map([[assetDirectory, metadata('directory', 0)]]);
  const headers = new Map();
  const tracked = new Set();
  for (const asset of contract.assets) {
    const path = resolve(assetDirectory, asset.filename);
    entries.set(path, metadata('file', 50_000));
    headers.set(
      path,
      pngHeader(
        asset.width,
        Math.ceil((asset.minHeight + asset.maxHeight) / 2),
      ),
    );
    tracked.add(path);
  }
  for (const mutation of options.mutations ?? []) {
    mutation({ assetDirectory, contract, entries, headers, root, tracked });
  }
  const guideSource =
    options.guideSource ??
    contract.assets
      .map((asset) => `![${asset.role}](${asset.guideReference})`)
      .join('\n');
  const gitCalls = [];
  return {
    contract,
    gitCalls,
    options: {
      contract,
      fileSystem: {
        lstat: (path) => {
          const entry = entries.get(path);
          if (!entry) throw missingError();
          return entry;
        },
        readFile: () => {
          throw new Error('fixture guide should be injected');
        },
        readHeader: (path) => {
          const header = headers.get(path);
          if (!header) throw new Error('UNTRUSTED_HEADER_DETAIL');
          return header;
        },
        realpath: (path) => path,
      },
      gitRunner: (gitRoot, relativePath) => {
        gitCalls.push({ gitRoot, relativePath });
        return tracked.has(resolve(gitRoot, relativePath));
      },
      guideSource,
      repositoryRoot: root,
    },
  };
}

test('accepts the four current tracked and documented PNG assets', () => {
  const result = checkDemoScreenshotAssets({ repositoryRoot });

  assert.deepEqual(result.failures, []);
  assert.equal(result.checkedAssetCount, 4);
  assert.match(
    formatDemoScreenshotAssetReport(result),
    /Validated 4 tracked safe-demo PNG assets offline/u,
  );
});

test('reports missing, untracked, and undocumented assets together', () => {
  const fixture = createFixture({
    mutations: [
      ({ assetDirectory, contract, entries }) => {
        entries.delete(resolve(assetDirectory, contract.assets[0].filename));
      },
      ({ assetDirectory, contract, tracked }) => {
        tracked.delete(resolve(assetDirectory, contract.assets[1].filename));
      },
    ],
  });
  fixture.options.guideSource = fixture.options.guideSource.replace(
    `](${fixture.contract.assets[2].guideReference})`,
    '](missing-reference.png)',
  );

  const result = checkDemoScreenshotAssets(fixture.options);

  assert.ok(
    result.failures.some((failure) => failure.reason.includes('missing')),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('tracked by Git'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('guide reference is missing'),
    ),
  );
});

test('rejects traversal and symbolic-link assets before reading headers or Git', () => {
  const traversalContract = cloneContract();
  traversalContract.assets[0].filename = '../escape.png';
  traversalContract.assets[0].guideReference = 'assets/escape.png';
  const traversal = createFixture({ contract: traversalContract });
  const traversalResult = checkDemoScreenshotAssets(traversal.options);
  assert.ok(
    traversalResult.failures.some((failure) =>
      failure.reason.includes('repository-local PNG name'),
    ),
  );

  const symbolicLink = createFixture({
    mutations: [
      ({ assetDirectory, contract, entries }) => {
        entries.set(
          resolve(assetDirectory, contract.assets[0].filename),
          metadata('symlink'),
        );
      },
    ],
  });
  const linkResult = checkDemoScreenshotAssets(symbolicLink.options);
  assert.ok(
    linkResult.failures.some((failure) =>
      failure.reason.includes('non-symbolic-link'),
    ),
  );
  assert.equal(symbolicLink.gitCalls.length, 3);
});

test('reports malformed PNG, wrong dimensions, and oversized bytes', () => {
  const fixture = createFixture({
    mutations: [
      ({ assetDirectory, contract, headers }) => {
        headers.set(
          resolve(assetDirectory, contract.assets[0].filename),
          Buffer.alloc(24),
        );
      },
      ({ assetDirectory, contract, headers }) => {
        const asset = contract.assets[1];
        headers.set(
          resolve(assetDirectory, asset.filename),
          pngHeader(asset.width + 1, asset.minHeight - 1),
        );
      },
      ({ assetDirectory, contract, entries }) => {
        const asset = contract.assets[2];
        entries.set(
          resolve(assetDirectory, asset.filename),
          metadata('file', asset.maxBytes + 1),
        );
      },
    ],
  });

  const result = checkDemoScreenshotAssets(fixture.options);

  assert.ok(result.failures.some((failure) => failure.reason.includes('IHDR')));
  assert.ok(
    result.failures.some((failure) => failure.reason.includes('width')),
  );
  assert.ok(
    result.failures.some((failure) => failure.reason.includes('height')),
  );
  assert.ok(
    result.failures.some((failure) => failure.reason.includes('file size')),
  );
});

test('rejects duplicate filenames from the shared contract', () => {
  const contract = cloneContract();
  contract.assets[1].filename = contract.assets[0].filename;
  contract.assets[1].guideReference = contract.assets[0].guideReference;
  const fixture = createFixture({ contract });

  const result = checkDemoScreenshotAssets(fixture.options);

  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('filename is duplicated'),
    ),
  );
  assert.ok(
    result.failures.some((failure) =>
      failure.reason.includes('guideReference is duplicated'),
    ),
  );
});

test('keeps failure output bounded and repository-relative', () => {
  const contract = cloneContract();
  contract.assets[0].filename = `${'escape'.repeat(50)}.png`;
  contract.assets[0].guideReference = `assets/demo/${contract.assets[0].filename}`;
  const fixture = createFixture({ contract });
  let output = '';

  const exitCode = runDemoScreenshotAssetCheck({
    ...fixture.options,
    write: (value) => {
      output += value;
    },
  });

  assert.equal(exitCode, 1);
  assert.match(output, /Safe-demo screenshot validation failed/u);
  assert.equal(output.includes(fixture.options.repositoryRoot), false);
  assert.ok(
    output
      .trimEnd()
      .split('\n')
      .every((line) => line.length <= 350),
  );
  assert.doesNotMatch(output, /UNTRUSTED_/u);
});
