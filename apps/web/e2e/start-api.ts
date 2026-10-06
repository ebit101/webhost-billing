import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import checkScope from './check-scope';
import { e2eApiEnvironment } from './environment';

async function main(): Promise<void> {
  await checkScope();
  // Compile sequentially in pretest, not while the browser/Next server need RAM.
  const child = spawn(
    process.execPath,
    [
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        '../../api/dist/main.js',
      ),
    ],
    { env: e2eApiEnvironment, stdio: 'inherit' },
  );
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => child.kill(signal));
  }
  child.on('error', () => {
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
}

main().catch(() => {
  console.error(
    'Refusing to start the browser-test API without verified fictional isolation.',
  );
  process.exitCode = 1;
});
