import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { repositoryRoot } from './tooling-dependencies.mjs';

const consumer = (request, name) => createRequire(request.resolve(name));

export function resolveToolchainSecurityConsumers() {
  const api = createRequire(resolve(repositoryRoot, 'apps/api/package.json'));
  const web = createRequire(resolve(repositoryRoot, 'apps/web/package.json'));
  const cli = consumer(api, '@nestjs/cli/package.json');
  const jest = consumer(api, 'jest');
  const core = consumer(jest, '@jest/core');
  const jestConfig = consumer(core, 'jest-config');
  const transform = consumer(core, '@jest/transform');
  const istanbul = consumer(transform, 'babel-plugin-istanbul');
  const exclude = consumer(istanbul, 'test-exclude');
  const eslint = consumer(api, 'eslint');
  const typescriptEslint = consumer(api, 'typescript-eslint');
  const parser = consumer(typescriptEslint, '@typescript-eslint/parser');
  const estree = consumer(parser, '@typescript-eslint/typescript-estree');
  const nextConfig = consumer(web, 'eslint-config-next');
  const hooks = consumer(nextConfig, 'eslint-plugin-react-hooks');
  const vitest = consumer(web, 'vitest/package.json');
  const paths = consumer(web, 'vite-tsconfig-paths');
  const checker = consumer(cli, 'fork-ts-checker-webpack-plugin');

  return {
    api,
    web,
    hooks,
    vitest,
    viteConsumers: [vitest, paths],
    modernGlobs: [cli, jestConfig].map((request) => ({
      version: request('glob/package.json').version,
      module: request('glob'),
    })),
    modernMatcher: {
      version: estree('minimatch/package.json').version,
      module: estree('minimatch'),
    },
    legacyMatchers: [eslint, consumer(exclude, 'glob')].map((request) => ({
      version: request('minimatch/package.json').version,
      module: request('minimatch'),
      path: request.resolve('minimatch'),
    })),
    legacyGlob: exclude('glob'),
    merges: [checker, jestConfig].map((request) => ({
      version: request('deepmerge/package.json').version,
      module: request('deepmerge'),
      path: request.resolve('deepmerge'),
    })),
  };
}
