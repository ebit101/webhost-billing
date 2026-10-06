import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// Resolve through real consumers, not a guessed pnpm store path or a test substitute.
export function resolveToolingDependencies() {
  const web = createRequire(resolve(repositoryRoot, 'apps/web/package.json'));
  const nextConfig = createRequire(web.resolve('eslint-config-next'));
  const nextPlugin = createRequire(
    nextConfig.resolve('@next/eslint-plugin-next'),
  );
  const globPath = nextPlugin.resolve('fast-glob');
  const glob = createRequire(globPath);
  const micromatchPath = glob.resolve('micromatch');
  const micromatch = createRequire(micromatchPath);
  const bracesPath = micromatch.resolve('braces');
  const braces = createRequire(bracesPath);

  const api = createRequire(resolve(repositoryRoot, 'apps/api/package.json'));
  const jest = createRequire(api.resolve('jest'));
  const jestCore = createRequire(jest.resolve('@jest/core'));
  const transformPath = jestCore.resolve('@jest/transform');
  const transform = createRequire(transformPath);
  const istanbulPath = transform.resolve('babel-plugin-istanbul');
  const istanbul = createRequire(istanbulPath);
  const nyc = createRequire(istanbul.resolve('@istanbuljs/load-nyc-config'));
  const yaml = createRequire(nyc.resolve('js-yaml'));
  const argparsePath = yaml.resolve('argparse');
  const argparse = createRequire(argparsePath);
  const sprintfPath = argparse.resolve('sprintf-js');

  return {
    bracesPath,
    bracesVersion: braces('braces/package.json').version,
    compilePath: braces.resolve('./lib/compile'),
    expandPath: braces.resolve('./lib/expand'),
    stringifyPath: braces.resolve('./lib/stringify'),
    utilsPath: braces.resolve('./lib/utils'),
    globPath,
    micromatchPath,
    sprintfPath,
    sprintfVersion: argparse('sprintf-js/package.json').version,
    argparsePath,
    istanbulPath,
    babelPath: transform.resolve('@babel/core'),
  };
}
