import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'prisma/config';

const repositoryEnvironmentPath = resolve(process.cwd(), '../../.env');

if (existsSync(repositoryEnvironmentPath)) {
  process.loadEnvFile(repositoryEnvironmentPath);
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url:
      process.env.DATABASE_URL ??
      'postgresql://invalid:invalid@127.0.0.1:1/invalid',
  },
});
