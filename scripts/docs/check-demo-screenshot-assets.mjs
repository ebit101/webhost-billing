import { spawnSync } from 'node:child_process';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultRepositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const defaultContractPath = 'scripts/demo/demo-screenshot-contract.json';
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const headerLength = 24;
const maximumReportLabelLength = 160;

function defaultFileSystem() {
  return {
    lstat: (path) => lstatSync(path),
    readFile: (path) => readFileSync(path, 'utf8'),
    readHeader: (path) => {
      const descriptor = openSync(path, 'r');
      try {
        const header = Buffer.alloc(headerLength);
        const bytesRead = readSync(descriptor, header, 0, header.length, 0);
        return header.subarray(0, bytesRead);
      } finally {
        closeSync(descriptor);
      }
    },
    realpath: (path) => realpathSync(path),
  };
}

function defaultGitRunner(repositoryRoot, relativePath) {
  const result = spawnSync(
    'git',
    ['ls-files', '--error-unmatch', '--', relativePath],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
    },
  );
  return result.status === 0 && !result.error;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isInside(parent, candidate) {
  const pathFromParent = relative(parent, candidate);
  return (
    pathFromParent === '' ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== '..' &&
      !isAbsolute(pathFromParent))
  );
}

function samePath(left, right) {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function reportLabel(value) {
  const normalized = String(value ?? 'contract')
    .replaceAll('\\', '/')
    .replace(/[\r\n\t\u0000-\u001f\u007f]/gu, '?');
  return normalized.slice(0, maximumReportLabelLength) || 'contract';
}

function addFailure(failures, asset, reason) {
  failures.push({
    asset: reportLabel(asset),
    reason: reportLabel(reason),
  });
}

function integerInRange(value, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}

function parsePngHeader(header) {
  if (!Buffer.isBuffer(header) || header.length < headerLength)
    return undefined;
  if (!header.subarray(0, pngSignature.length).equals(pngSignature)) {
    return undefined;
  }
  if (
    header.readUInt32BE(8) !== 13 ||
    header.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    return undefined;
  }
  return {
    height: header.readUInt32BE(20),
    width: header.readUInt32BE(16),
  };
}

function loadContract(fileSystem, repositoryRoot, options) {
  if (options.contract !== undefined) return options.contract;
  const contractSource = fileSystem.readFile(
    resolve(repositoryRoot, defaultContractPath),
  );
  return JSON.parse(contractSource);
}

function validateContractShape(contract, failures) {
  if (!isRecord(contract)) {
    addFailure(failures, defaultContractPath, 'must contain one JSON object');
    return false;
  }
  if (contract.version !== 1) {
    addFailure(failures, defaultContractPath, 'version must equal 1');
  }
  if (
    !Number.isInteger(contract.expectedAssetCount) ||
    contract.expectedAssetCount !== 4
  ) {
    addFailure(
      failures,
      defaultContractPath,
      'expectedAssetCount must equal 4',
    );
  }
  if (
    typeof contract.assetDirectory !== 'string' ||
    contract.assetDirectory !== 'docs/assets/demo'
  ) {
    addFailure(
      failures,
      defaultContractPath,
      'assetDirectory must equal docs/assets/demo',
    );
  }
  if (
    typeof contract.canonicalGuide !== 'string' ||
    contract.canonicalGuide !== 'docs/SAFE_EVALUATION_DEMO.md'
  ) {
    addFailure(
      failures,
      defaultContractPath,
      'canonicalGuide must equal docs/SAFE_EVALUATION_DEMO.md',
    );
  }
  if (!Array.isArray(contract.assets)) {
    addFailure(failures, defaultContractPath, 'assets must be an array');
    return false;
  }
  if (contract.assets.length !== contract.expectedAssetCount) {
    addFailure(
      failures,
      defaultContractPath,
      'assets must contain exactly 4 entries',
    );
  }
  return true;
}

function validateAssetShape(asset, index, failures) {
  const label = isRecord(asset) ? asset.filename : `assets[${index}]`;
  if (!isRecord(asset)) {
    addFailure(failures, label, 'must be an object');
    return false;
  }
  let valid = true;
  if (
    typeof asset.id !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(asset.id)
  ) {
    addFailure(failures, label, 'id must be lowercase kebab-case');
    valid = false;
  }
  if (
    typeof asset.filename !== 'string' ||
    asset.filename.length > 128 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/u.test(asset.filename)
  ) {
    addFailure(
      failures,
      label,
      'filename must be one repository-local PNG name',
    );
    valid = false;
  }
  if (typeof asset.role !== 'string' || asset.role.trim().length < 8) {
    addFailure(failures, label, 'role must describe the screenshot');
    valid = false;
  }
  if (
    typeof asset.guideReference !== 'string' ||
    asset.guideReference !== `assets/demo/${asset.filename}`
  ) {
    addFailure(
      failures,
      label,
      'guideReference must match the canonical asset path',
    );
    valid = false;
  }
  for (const [field, minimum, maximum] of [
    ['width', 300, 2_000],
    ['captureViewportHeight', 600, 1_500],
    ['minHeight', 600, 4_000],
    ['maxHeight', 600, 4_000],
    ['minBytes', 1_000, 2_000_000],
    ['maxBytes', 1_000, 2_000_000],
  ]) {
    if (!integerInRange(asset[field], minimum, maximum)) {
      addFailure(failures, label, `${field} is outside its contract range`);
      valid = false;
    }
  }
  if (
    Number.isInteger(asset.minHeight) &&
    Number.isInteger(asset.maxHeight) &&
    asset.minHeight > asset.maxHeight
  ) {
    addFailure(failures, label, 'height bounds are reversed');
    valid = false;
  }
  if (
    Number.isInteger(asset.minBytes) &&
    Number.isInteger(asset.maxBytes) &&
    asset.minBytes > asset.maxBytes
  ) {
    addFailure(failures, label, 'byte bounds are reversed');
    valid = false;
  }
  return valid;
}

function validateUniqueFields(assets, failures) {
  for (const field of ['id', 'filename', 'role', 'guideReference']) {
    const seen = new Set();
    for (const asset of assets) {
      if (!isRecord(asset) || typeof asset[field] !== 'string') continue;
      if (seen.has(asset[field])) {
        addFailure(
          failures,
          asset.filename,
          `${field} is duplicated in the contract`,
        );
      }
      seen.add(asset[field]);
    }
  }
}

export function checkDemoScreenshotAssets(options = {}) {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? defaultRepositoryRoot,
  );
  const fileSystem = options.fileSystem ?? defaultFileSystem();
  const gitRunner = options.gitRunner ?? defaultGitRunner;
  const failures = [];
  let contract;
  try {
    contract = loadContract(fileSystem, repositoryRoot, options);
  } catch {
    addFailure(
      failures,
      defaultContractPath,
      'could not be read as bounded JSON',
    );
    return { checkedAssetCount: 0, failures };
  }
  if (!validateContractShape(contract, failures)) {
    return { checkedAssetCount: 0, failures };
  }

  validateUniqueFields(contract.assets, failures);
  let canonicalRepositoryRoot;
  let canonicalAssetDirectory;
  const assetDirectory = resolve(repositoryRoot, contract.assetDirectory);
  try {
    const directoryMetadata = fileSystem.lstat(assetDirectory);
    if (
      directoryMetadata.isSymbolicLink() ||
      !directoryMetadata.isDirectory()
    ) {
      throw new Error('unsafe directory');
    }
    canonicalRepositoryRoot = fileSystem.realpath(repositoryRoot);
    canonicalAssetDirectory = fileSystem.realpath(assetDirectory);
    if (
      !isInside(canonicalRepositoryRoot, canonicalAssetDirectory) ||
      !samePath(
        canonicalAssetDirectory,
        join(canonicalRepositoryRoot, 'docs', 'assets', 'demo'),
      )
    ) {
      throw new Error('escaping directory');
    }
  } catch {
    addFailure(
      failures,
      contract.assetDirectory,
      'asset directory must be a confined regular directory',
    );
    return { checkedAssetCount: 0, failures };
  }

  let guideSource;
  try {
    guideSource =
      options.guideSource ??
      fileSystem.readFile(resolve(repositoryRoot, contract.canonicalGuide));
  } catch {
    addFailure(
      failures,
      contract.canonicalGuide,
      'canonical guide could not be read',
    );
    guideSource = '';
  }

  let checkedAssetCount = 0;
  for (const [index, asset] of contract.assets.entries()) {
    if (!validateAssetShape(asset, index, failures)) continue;
    const label = `${contract.assetDirectory}/${asset.filename}`;
    const absoluteAsset = resolve(assetDirectory, asset.filename);
    if (!isInside(assetDirectory, absoluteAsset)) {
      addFailure(failures, label, 'path resolves outside the asset directory');
      continue;
    }

    let metadata;
    try {
      metadata = fileSystem.lstat(absoluteAsset);
    } catch {
      addFailure(failures, label, 'asset is missing or unreadable');
      continue;
    }
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      addFailure(
        failures,
        label,
        'asset must be a regular non-symbolic-link file',
      );
      continue;
    }

    try {
      const canonicalAsset = fileSystem.realpath(absoluteAsset);
      if (
        !isInside(canonicalAssetDirectory, canonicalAsset) ||
        !samePath(canonicalAsset, join(canonicalAssetDirectory, asset.filename))
      ) {
        addFailure(
          failures,
          label,
          'canonical path escapes the asset directory',
        );
        continue;
      }
    } catch {
      addFailure(failures, label, 'canonical path could not be verified');
      continue;
    }

    checkedAssetCount += 1;
    if (metadata.size < asset.minBytes || metadata.size > asset.maxBytes) {
      addFailure(failures, label, 'file size is outside the contract bounds');
    }

    let dimensions;
    try {
      dimensions = parsePngHeader(fileSystem.readHeader(absoluteAsset));
    } catch {
      dimensions = undefined;
    }
    if (!dimensions) {
      addFailure(failures, label, 'PNG signature or IHDR header is invalid');
    } else {
      if (dimensions.width !== asset.width) {
        addFailure(failures, label, 'PNG width does not match the contract');
      }
      if (
        dimensions.height < asset.minHeight ||
        dimensions.height > asset.maxHeight
      ) {
        addFailure(
          failures,
          label,
          'PNG height is outside the contract bounds',
        );
      }
    }

    const repositoryRelativeAsset = relative(
      repositoryRoot,
      absoluteAsset,
    ).replaceAll('\\', '/');
    let tracked = false;
    try {
      tracked = gitRunner(repositoryRoot, repositoryRelativeAsset) === true;
    } catch {
      tracked = false;
    }
    if (!tracked) {
      addFailure(failures, label, 'asset must be tracked by Git');
    }
    if (!guideSource.includes(`](${asset.guideReference})`)) {
      addFailure(failures, label, 'canonical guide reference is missing');
    }
  }

  return { checkedAssetCount, failures };
}

export function formatDemoScreenshotAssetReport(result) {
  if (result.failures.length === 0) {
    return `Validated ${result.checkedAssetCount} tracked safe-demo PNG assets offline.\n`;
  }
  const lines = [
    `Safe-demo screenshot validation failed with ${result.failures.length} problem${result.failures.length === 1 ? '' : 's'}:`,
    ...result.failures.map(
      (failure) => `- ${failure.asset} — ${failure.reason}`,
    ),
  ];
  return `${lines.join('\n')}\n`;
}

export function runDemoScreenshotAssetCheck(options = {}) {
  const result = checkDemoScreenshotAssets(options);
  const write = options.write ?? ((value) => process.stdout.write(value));
  write(formatDemoScreenshotAssetReport(result));
  return result.failures.length === 0 ? 0 : 1;
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (import.meta.url === invokedPath) {
  try {
    process.exitCode = runDemoScreenshotAssetCheck();
  } catch {
    process.stderr.write(
      'Safe-demo screenshot validation could not run safely.\n',
    );
    process.exitCode = 1;
  }
}

export const demoScreenshotAssetContract = Object.freeze({
  contractPath: defaultContractPath,
  headerLength,
  maximumReportLabelLength,
});
