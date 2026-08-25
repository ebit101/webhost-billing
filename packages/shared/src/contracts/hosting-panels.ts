import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { requestedDomainSchema } from './orders';
import { serviceServerSchema } from './services';

export const hostingPanelOperationTypeSchema = z.enum([
  'TEST_CONNECTION',
  'CREATE_ACCOUNT',
  'GET_ACCOUNT',
  'SUSPEND_ACCOUNT',
  'UNSUSPEND_ACCOUNT',
  'CHANGE_PACKAGE',
  'CHANGE_PASSWORD',
  'GENERATE_LOGIN_URL',
  'TERMINATE_ACCOUNT',
]);

export const hostingPanelOperationStatusSchema = z.enum([
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'INCONSISTENT',
]);

export const hostingPanelErrorKindSchema = z.enum([
  'TEMPORARY',
  'PERMANENT',
  'INCONSISTENT',
]);

export const hostingAccountStateSchema = z.enum([
  'ACTIVE',
  'SUSPENDED',
  'MISSING',
]);

export const hostingPanelLoginUrlSchema = z
  .url()
  .refine(
    (value) => new URL(value).protocol === 'https:',
    'Panel login URL must use HTTPS',
  );

export const hostingAccountSchema = z
  .object({
    externalAccountId: z.string().min(1).max(191),
    username: z.string().min(1).max(64),
    domain: requestedDomainSchema,
    packageIdentifier: z.string().min(1).max(191),
    state: hostingAccountStateSchema,
  })
  .strict();

export const hostingPanelOperationSchema = z
  .object({
    id: z.uuid(),
    serviceId: z.uuid().nullable(),
    server: serviceServerSchema,
    requestedByUserId: z.uuid(),
    retryOfOperationId: z.uuid().nullable(),
    type: hostingPanelOperationTypeSchema,
    status: hostingPanelOperationStatusSchema,
    adapterKey: z.string().min(1).max(64),
    attemptNumber: z.number().int().positive(),
    retryable: z.boolean(),
    errorKind: hostingPanelErrorKindSchema.nullable(),
    errorCode: z.string().min(1).max(80).nullable(),
    errorMessage: z.string().min(1).max(1_000).nullable(),
    account: hostingAccountSchema.nullable(),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const submissionKeySchema = z.uuid();
const reasonSchema = z.string().trim().min(1).max(1_000);
const packageIdentifierSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,190}$/);
const passwordSchema = z.string().min(16).max(256);

export const executeHostingOperationRequestSchema = z.discriminatedUnion(
  'type',
  [
    z
      .object({
        type: z.literal('CREATE_ACCOUNT'),
        submissionKey: submissionKeySchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('GET_ACCOUNT'),
        submissionKey: submissionKeySchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('SUSPEND_ACCOUNT'),
        submissionKey: submissionKeySchema,
        reason: reasonSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('UNSUSPEND_ACCOUNT'),
        submissionKey: submissionKeySchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('CHANGE_PACKAGE'),
        submissionKey: submissionKeySchema,
        packageIdentifier: packageIdentifierSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('CHANGE_PASSWORD'),
        submissionKey: submissionKeySchema,
        newPassword: passwordSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('GENERATE_LOGIN_URL'),
        submissionKey: submissionKeySchema,
      })
      .strict(),
    z
      .object({
        type: z.literal('TERMINATE_ACCOUNT'),
        submissionKey: submissionKeySchema,
        reason: reasonSchema,
        confirmation: z.literal('TERMINATE'),
      })
      .strict(),
  ],
);

export const testHostingConnectionRequestSchema = z
  .object({ submissionKey: submissionKeySchema })
  .strict();

export const retryHostingOperationRequestSchema = z
  .object({
    submissionKey: submissionKeySchema,
    newPassword: passwordSchema.optional(),
    confirmation: z.literal('TERMINATE').optional(),
  })
  .strict();

export const hostingPanelOperationResultSchema = z
  .object({
    operation: hostingPanelOperationSchema,
    duplicate: z.boolean(),
    loginUrl: hostingPanelLoginUrlSchema.nullable(),
  })
  .strict();

export const hostingPanelOperationListQuerySchema =
  paginationQuerySchema.extend({
    serviceId: z.uuid().optional(),
    serverId: z.uuid().optional(),
    status: hostingPanelOperationStatusSchema.optional(),
    type: hostingPanelOperationTypeSchema.optional(),
  });

export type HostingPanelOperationType = z.infer<
  typeof hostingPanelOperationTypeSchema
>;
export type HostingPanelOperationStatus = z.infer<
  typeof hostingPanelOperationStatusSchema
>;
export type HostingPanelErrorKind = z.infer<typeof hostingPanelErrorKindSchema>;
export type HostingAccountState = z.infer<typeof hostingAccountStateSchema>;
export type HostingAccount = z.infer<typeof hostingAccountSchema>;
export type HostingPanelOperation = z.infer<typeof hostingPanelOperationSchema>;
export type ExecuteHostingOperationRequest = z.infer<
  typeof executeHostingOperationRequestSchema
>;
export type TestHostingConnectionRequest = z.infer<
  typeof testHostingConnectionRequestSchema
>;
export type RetryHostingOperationRequest = z.infer<
  typeof retryHostingOperationRequestSchema
>;
export type HostingPanelOperationResult = z.infer<
  typeof hostingPanelOperationResultSchema
>;
export type HostingPanelOperationListQuery = z.infer<
  typeof hostingPanelOperationListQuerySchema
>;
