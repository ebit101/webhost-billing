import { z } from 'zod';
import { paginationQuerySchema } from './pagination';
import { serviceStatusSchema, ticketStatusSchema } from './states';

export const ticketPrioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

export const ticketMessageKindSchema = z.enum(['CUSTOMER', 'ADMIN', 'SYSTEM']);

const plainText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .refine((value) => !/[<>]/u.test(value), {
      message: 'Use plain text without HTML markup.',
    })
    .refine(
      (value) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value),
      { message: 'Text contains unsupported control characters.' },
    );

export const ticketSubjectSchema = plainText(200);
export const ticketMessageBodySchema = plainText(10_000);

export const ticketCustomerSchema = z
  .object({
    id: z.uuid(),
    customerNumber: z.string().min(1).max(32),
    name: z.string().min(1).max(200),
  })
  .strict();

export const ticketServiceReferenceSchema = z
  .object({
    id: z.uuid(),
    productName: z.string().min(1).max(160),
    domain: z.string().min(1).max(253).nullable(),
    status: serviceStatusSchema,
  })
  .strict();

export const ticketAssigneeSchema = z
  .object({
    userId: z.uuid(),
    displayName: z.string().min(1).max(150),
  })
  .strict();

export const ticketMessageSchema = z
  .object({
    id: z.uuid(),
    ticketId: z.uuid(),
    authorUserId: z.uuid(),
    authorName: z.string().min(1).max(200),
    kind: ticketMessageKindSchema,
    body: ticketMessageBodySchema,
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const defaultSupportDepartmentId =
  '21600000-0000-4000-8000-000000000001';
export const supportDepartmentOptionSchema = z
  .object({
    id: z.uuid(),
    name: plainText(80),
    enabled: z.boolean(),
    customerVisible: z.boolean(),
  })
  .strict();
export const supportDepartmentSchema = supportDepartmentOptionSchema
  .extend({
    restricted: z.boolean(),
    revision: z.number().int().positive(),
    memberUserIds: z.array(z.uuid()).max(100),
  })
  .strict();
export const saveSupportDepartmentSchema = z
  .object({
    name: plainText(80),
    enabled: z.boolean(),
    customerVisible: z.boolean(),
    restricted: z.boolean(),
    memberUserIds: z
      .array(z.uuid())
      .max(100)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Duplicate staff members.',
      ),
    reason: plainText(500),
    revision: z.number().int().positive().optional(),
  })
  .strict();
export type SupportDepartmentOption = z.infer<
  typeof supportDepartmentOptionSchema
>;
export type SupportDepartment = z.infer<typeof supportDepartmentSchema>;
export type SaveSupportDepartment = z.infer<typeof saveSupportDepartmentSchema>;

export const ticketSummarySchema = z
  .object({
    id: z.uuid(),
    ticketNumber: z.string().min(1).max(32),
    department: supportDepartmentOptionSchema,
    customer: ticketCustomerSchema,
    service: ticketServiceReferenceSchema.nullable(),
    assignee: ticketAssigneeSchema.nullable(),
    subject: ticketSubjectSchema,
    status: ticketStatusSchema,
    priority: ticketPrioritySchema,
    messageCount: z.number().int().min(1),
    lastReplyAt: z.iso.datetime({ offset: true }).nullable(),
    closedAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ticketDetailSchema = ticketSummarySchema
  .extend({ messages: z.array(ticketMessageSchema) })
  .strict();

export const createTicketRequestSchema = z
  .object({
    submissionKey: z.uuid(),
    departmentId: z.uuid().optional(),
    subject: ticketSubjectSchema,
    body: ticketMessageBodySchema,
    serviceId: z.uuid().nullable().optional(),
  })
  .strict();

export const replyToTicketRequestSchema = z
  .object({
    submissionKey: z.uuid(),
    body: ticketMessageBodySchema,
  })
  .strict();

export const updateTicketRequestSchema = z
  .object({
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    assignedAdminId: z.uuid().nullable().optional(),
    departmentId: z.uuid().optional(),
    routingReason: plainText(500).optional(),
  })
  .strict()
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: 'At least one ticket field must be supplied.',
    },
  );

export const ticketListQuerySchema = paginationQuerySchema
  .extend({
    search: z.string().trim().max(200).optional(),
    status: ticketStatusSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    departmentId: z.uuid().optional(),
    customerId: z.uuid().optional(),
    serviceId: z.uuid().optional(),
    assignedAdminId: z.uuid().optional(),
    unassigned: z.coerce.boolean().default(false),
  })
  .refine((query) => !(query.unassigned && query.assignedAdminId), {
    message:
      'Assigned-administrator and unassigned filters cannot be combined.',
  });

export const myTicketListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  status: ticketStatusSchema.optional(),
  serviceId: z.uuid().optional(),
});

export const ticketAdminOptionSchema = ticketAssigneeSchema;

export const ticketSetupOptionsSchema = z
  .object({
    admins: z.array(ticketAdminOptionSchema),
    departments: z.array(supportDepartmentSchema),
    canManageDepartments: z.boolean(),
  })
  .strict();

export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type TicketMessageKind = z.infer<typeof ticketMessageKindSchema>;
export type TicketCustomer = z.infer<typeof ticketCustomerSchema>;
export type TicketServiceReference = z.infer<
  typeof ticketServiceReferenceSchema
>;
export type TicketAssignee = z.infer<typeof ticketAssigneeSchema>;
export type TicketMessage = z.infer<typeof ticketMessageSchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketDetail = z.infer<typeof ticketDetailSchema>;
export type CreateTicketRequest = z.infer<typeof createTicketRequestSchema>;
export type ReplyToTicketRequest = z.infer<typeof replyToTicketRequestSchema>;
export type UpdateTicketRequest = z.infer<typeof updateTicketRequestSchema>;
export type TicketListQuery = z.infer<typeof ticketListQuerySchema>;
export type MyTicketListQuery = z.infer<typeof myTicketListQuerySchema>;
export type TicketSetupOptions = z.infer<typeof ticketSetupOptionsSchema>;
