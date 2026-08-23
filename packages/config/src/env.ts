import { z } from 'zod';

export const nodeEnvironmentSchema = z.enum([
  'development',
  'test',
  'production',
]);

export const baseEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema.default('development'),
});

export const serverEnvironmentSchema = baseEnvironmentSchema.extend({
  PORT: z.coerce.number().int().min(1).max(65_535),
});

export type BaseEnvironment = z.infer<typeof baseEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function parseBaseEnvironment(
  environment: NodeJS.ProcessEnv,
): BaseEnvironment {
  return baseEnvironmentSchema.parse(environment);
}

export function parseServerEnvironment(
  environment: NodeJS.ProcessEnv,
): ServerEnvironment {
  return serverEnvironmentSchema.parse(environment);
}
