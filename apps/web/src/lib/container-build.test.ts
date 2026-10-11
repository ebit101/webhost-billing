import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('clean web container build prerequisites', () => {
  it('generates database types after copying source and before building the web application', () => {
    const recipe = readFileSync(resolve(process.cwd(), 'Dockerfile'), 'utf8');
    const sourceCopy = recipe.indexOf('COPY . .');
    const generation = recipe.indexOf(
      'pnpm --filter @webhost-billing/database db:generate',
    );
    const webBuild = recipe.indexOf('pnpm --filter @webhost-billing/web build');
    expect(sourceCopy).toBeGreaterThan(-1);
    expect(generation).toBeGreaterThan(sourceCopy);
    expect(webBuild).toBeGreaterThan(generation);
    expect(recipe).toContain('--frozen-lockfile');
    expect(recipe).not.toMatch(
      /ARG\s+DATABASE_URL|ignoreBuildErrors|SKIP_TYPECHECK/,
    );
  });
});
