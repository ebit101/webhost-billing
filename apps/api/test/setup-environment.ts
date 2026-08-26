import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
];
const environmentPath = candidates.find((candidate) => existsSync(candidate));

if (!environmentPath) {
  throw new Error('Repository .env file is required for API integration tests');
}

for (const [key, value] of Object.entries(
  parseEnv(readFileSync(environmentPath, 'utf8')),
)) {
  process.env[key] ??= value;
}

process.env.NODE_ENV = 'test';
process.env.AUTH_RATE_LIMIT_NAMESPACE = `e2e-${process.pid}`;
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.API_PUBLIC_ORIGIN = 'http://localhost:3001';
