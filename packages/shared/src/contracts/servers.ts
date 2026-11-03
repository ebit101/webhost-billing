import { z } from 'zod';
import {
  createCpanelServerRequestSchema,
  updateCpanelServerRequestSchema,
  managedCpanelServerSchema,
} from './hosting-panels';

export const serverTypes = [
  'CPANEL',
  'VIRTUALIZOR',
  'VULTR',
  'SHOUTCAST',
] as const;
export type ServerType = (typeof serverTypes)[number];
export const serverTypeLabels: Record<ServerType, string> = {
  CPANEL: 'cPanel server',
  VIRTUALIZOR: 'VPS node server (Virtualizor)',
  VULTR: 'Vultr Cloud server',
  SHOUTCAST: 'ShoutCast server',
};
export const serverAdapterKeys: Record<ServerType, string> = {
  CPANEL: 'cpanel-whm',
  VIRTUALIZOR: 'virtualizor',
  VULTR: 'vultr',
  SHOUTCAST: 'shoutcast',
};
export function serverTypeForAdapter(adapterKey: string): ServerType {
  return (
    serverTypes.find((type) => serverAdapterKeys[type] === adapterKey) ??
    'CPANEL'
  );
}

const secret = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) => !/[\u0000-\u001f\u007f]/.test(value),
    'Credentials must not contain control characters',
  );
const common = createCpanelServerRequestSchema.pick({
  name: true,
  hostname: true,
  maxAccounts: true,
});
export const virtualizorCredentialsSchema = z
  .object({
    apiKey: secret,
    apiPassword: secret,
  })
  .strict();
const vultrCredentials = z.object({ apiKey: secret }).strict();
const shoutcastCredentials = z.object({ adminPassword: secret }).strict();
const virtualizor = common
  .extend({
    serverType: z.literal('VIRTUALIZOR'),
    port: z.union([z.literal(443), z.literal(4085)]).default(4085),
    credentials: virtualizorCredentialsSchema,
  })
  .strict();
const vultr = common
  .extend({
    serverType: z.literal('VULTR'),
    hostname: z.literal('api.vultr.com').default('api.vultr.com'),
    port: z.literal(443).default(443),
    credentials: vultrCredentials,
  })
  .strict();
const shoutcast = common
  .extend({
    serverType: z.literal('SHOUTCAST'),
    port: z.number().int().min(1).max(65535),
    credentials: shoutcastCredentials,
  })
  .strict();
export const createServerRequestSchema = z.union([
  createCpanelServerRequestSchema
    .extend({ serverType: z.literal('CPANEL').optional() })
    .strict(),
  virtualizor,
  vultr,
  shoutcast,
]);
// Provider changes are deliberately excluded. Retire the old record and add a new one.
// Updates must not inherit create defaults: a name edit must preserve port/capacity.
const updateCommon = z.object({
  name: common.shape.name.optional(),
  hostname: common.shape.hostname.optional(),
  maxAccounts: common.shape.maxAccounts.removeDefault().optional(),
  status: z.literal('DISABLED').optional(),
});
export const updateServerRequestSchema = z.union([
  updateCpanelServerRequestSchema,
  updateCommon
    .extend({
      serverType: z.literal('VIRTUALIZOR'),
      port: virtualizor.shape.port.removeDefault().optional(),
      credentials: virtualizorCredentialsSchema.optional(),
    })
    .strict(),
  updateCommon
    .extend({
      serverType: z.literal('VULTR'),
      hostname: z.literal('api.vultr.com').optional(),
      port: z.literal(443).optional(),
      credentials: vultrCredentials.optional(),
    })
    .strict(),
  updateCommon
    .extend({
      serverType: z.literal('SHOUTCAST'),
      port: shoutcast.shape.port.optional(),
      credentials: shoutcastCredentials.optional(),
    })
    .strict(),
]);
export const managedServerSchema = managedCpanelServerSchema
  .extend({
    port: z.number().int().min(1).max(65535),
    apiUsername: z.string().max(128).nullable(),
  })
  .strict();
export const managedServerListSchema = z.array(managedServerSchema);
export type ManagedServer = z.infer<typeof managedServerSchema>;
export type CreateServerRequest = z.infer<typeof createServerRequestSchema>;
export type UpdateServerRequest = z.infer<typeof updateServerRequestSchema>;
