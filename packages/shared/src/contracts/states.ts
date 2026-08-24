import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'CUSTOMER']);

export const productStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']);

export const hostingBillingPeriodSchema = z.enum([
  'MONTHLY',
  'QUARTERLY',
  'ANNUAL',
]);

export const orderStatusSchema = z.enum([
  'PENDING',
  'AWAITING_PAYMENT',
  'PAID',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'FAILED',
]);

export const invoiceStatusSchema = z.enum([
  'DRAFT',
  'UNPAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

export const paymentStatusSchema = z.enum([
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
]);

export const serviceStatusSchema = z.enum([
  'PENDING',
  'PROVISIONING',
  'ACTIVE',
  'SUSPENDED',
  'PROVISION_FAILED',
  'CANCELLED',
  'TERMINATED',
]);

export const ticketStatusSchema = z.enum([
  'OPEN',
  'WAITING_FOR_CUSTOMER',
  'WAITING_FOR_STAFF',
  'CLOSED',
]);

export type Role = z.infer<typeof roleSchema>;
export type ProductStatus = z.infer<typeof productStatusSchema>;
export type HostingBillingPeriod = z.infer<typeof hostingBillingPeriodSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type TicketStatus = z.infer<typeof ticketStatusSchema>;
