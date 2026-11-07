import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Cached approved image only: this command cannot pull or contact a provider.
const image =
  'node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6';
const root = fileURLToPath(new URL('../../', import.meta.url));
const available = spawnSync('docker', ['image', 'inspect', image], {
  stdio: 'ignore',
});
if (available.status !== 0) {
  throw new Error(
    'The cached Node test image and Docker engine are required; no image was pulled.',
  );
}
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--pull=never',
    '--network=none',
    '--mount',
    `type=bind,source=${join(root, 'scripts/deploy')},target=/repo/scripts/deploy,readonly`,
    '--mount',
    `type=bind,source=${join(root, 'deploy/staging/deploy-release.sh')},target=/repo/deploy/staging/deploy-release.sh,readonly`,
    '--env',
    'WEBHOST_DEPLOYMENT_COMMAND230_CONTAINER=fictional-command230',
    image,
    'node',
    '--test',
    '--test-concurrency=1',
    '/repo/scripts/deploy/deploy-release.test.mjs',
  ],
  { stdio: 'inherit', windowsHide: true },
);
process.exitCode = result.status ?? 1;
