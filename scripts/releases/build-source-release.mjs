import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..', '..');
const requestedTag = process.argv
  .slice(2)
  .find((argument) => argument !== '--');

if (
  !requestedTag ||
  !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedTag)
) {
  throw new Error('Usage: pnpm release:source:build -- <semver-tag>');
}

const version = requestedTag.slice(1);
const packageJson = JSON.parse(
  readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
);

if (packageJson.version !== version) {
  throw new Error(
    `Root package version ${packageJson.version} does not match requested release ${version}.`,
  );
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
}

const gitStatus = run('git', ['status', '--porcelain'], {
  capture: true,
}).trim();
if (gitStatus) {
  throw new Error('The release builder requires a clean working tree.');
}

const head = run('git', ['rev-parse', 'HEAD'], { capture: true }).trim();
const releaseCommit = run('git', ['rev-parse', `${requestedTag}^{commit}`], {
  capture: true,
}).trim();
if (head !== releaseCommit) {
  throw new Error(
    `Tag ${requestedTag} does not resolve to the checked-out commit ${head}.`,
  );
}

const outputDirectory = join(repositoryRoot, 'release-artifacts', requestedTag);
if (existsSync(outputDirectory) && readdirSync(outputDirectory).length > 0) {
  throw new Error(
    `Refusing to overwrite non-empty output directory ${outputDirectory}.`,
  );
}
mkdirSync(outputDirectory, { recursive: true });

const baseName = `webhost-billing-${requestedTag}`;
const archivePrefix = `${baseName}/`;
const artifacts = [
  `${baseName}.tar.gz`,
  `${baseName}.zip`,
  `${baseName}.cyclonedx.json`,
  `${baseName}.production.cyclonedx.json`,
];

run('git', [
  'archive',
  '--format=tar.gz',
  `--prefix=${archivePrefix}`,
  `--output=${join(outputDirectory, artifacts[0])}`,
  requestedTag,
]);
run('git', [
  'archive',
  '--format=zip',
  `--prefix=${archivePrefix}`,
  `--output=${join(outputDirectory, artifacts[1])}`,
  requestedTag,
]);

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const sbomBaseArguments = [
  'sbom',
  '--sbom-format',
  'cyclonedx',
  '--sbom-spec-version',
  '1.7',
  '--sbom-type',
  'application',
  '--sbom-authors',
  'Webhost Billing contributors',
  '--sbom-supplier',
  'Webhost Billing contributors',
];
run(pnpm, [...sbomBaseArguments, '--out', join(outputDirectory, artifacts[2])]);
run(pnpm, [
  ...sbomBaseArguments,
  '--prod',
  '--out',
  join(outputDirectory, artifacts[3]),
]);

for (const artifact of artifacts.slice(2)) {
  const sbom = JSON.parse(
    readFileSync(join(outputDirectory, artifact), 'utf8'),
  );
  if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.7') {
    throw new Error(`${artifact} is not a CycloneDX 1.7 document.`);
  }
}

const checksumLines = artifacts.map((artifact) => {
  const digest = createHash('sha256')
    .update(readFileSync(join(outputDirectory, artifact)))
    .digest('hex');
  return `${digest}  ${artifact}`;
});
writeFileSync(
  join(outputDirectory, 'SHA256SUMS'),
  `${checksumLines.join('\n')}\n`,
  'utf8',
);

process.stdout.write(
  `Created ${artifacts.length + 1} release assets for ${requestedTag} at ${outputDirectory}\n`,
);
