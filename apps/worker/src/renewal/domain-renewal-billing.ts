import type { Prisma, PrismaClient } from '@webhost-billing/database';
import { domainRenewalContext } from '@webhost-billing/database/domain-renewals';
import {
  PROJECT_NAME,
  renewalAutomationPolicySchema,
  type RenewalAutomationPolicy,
} from '@webhost-billing/shared';
import { allocateInvoiceNumber } from './invoice-number';
import {
  addBillingPeriod,
  addBusinessDays,
  businessDate,
} from './renewal-calendar';

export class DomainRenewalBilling {
  constructor(private readonly prisma: PrismaClient) {}
  async process(now: Date, policy: RenewalAutomationPolicy) {
    const counts = { processed: 0, succeeded: 0, failed: 0 };
    if (!policy.enabled) return counts;
    // Keyset paging avoids starving later domains when early ones need review.
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.domainRenewalPreference.findMany({
        where: { enabled: true },
        orderBy: { domainId: 'asc' },
        take: 100,
        ...(cursor ? { cursor: { domainId: cursor }, skip: 1 } : {}),
      });
      for (const row of batch) {
        counts.processed += 1;
        try {
          if (await this.one(row.domainId, now, policy)) counts.succeeded += 1;
        } catch {
          counts.failed += 1;
        }
      }
      if (batch.length < 100) break;
      cursor = batch.at(-1)!.domainId;
    }
    return counts;
  }
  private async one(id: string, now: Date, policy: RenewalAutomationPolicy) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM domains WHERE id=${id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(510118)::text`;
        const ctx = await domainRenewalContext(tx, id, now);
        if (!ctx?.preference?.enabled) return;
        const customer = await tx.customer.findUniqueOrThrow({
          where: { id: ctx.domain.customerId },
          include: { user: true },
        });
        let existing = await tx.domainRenewalInvoice.findFirst({
          where: { domainId: id },
          orderBy: { createdAt: 'desc' },
        });
        let code = ctx.code;
        if (
          existing &&
          (await tx.domainRenewalOperation.count({
            where: { renewalInvoiceId: existing.id, status: 'SUCCEEDED' },
          }))
        ) {
          if (ctx.domain.expiresAt && ctx.domain.expiresAt >= existing.termEnd)
            existing = null;
          else code = 'COMPLETED_EXPIRY_REQUIRES_REVIEW';
        }
        if (
          customer.deletedAt ||
          customer.status !== 'ACTIVE' ||
          customer.user.deletedAt ||
          customer.user.status !== 'ACTIVE' ||
          !customer.user.emailVerifiedAt
        )
          code = 'CUSTOMER_INELIGIBLE';
        if (
          process.env.NODE_ENV === 'production' &&
          ctx.account.mode === 'FAKE'
        )
          code = 'SIMULATION_DISABLED';
        if (
          existing &&
          existing.termStart.getTime() !== ctx.domain.expiresAt?.getTime()
        )
          code = 'UNRESOLVED_RENEWAL';
        if (!code && !existing && ctx.terms && !ctx.terms.productAttribution)
          code = 'ATTRIBUTION_REQUIRES_REVIEW';
        await this.review(tx, id, ctx.preference.reviewCode, code);
        if (code || !ctx.terms || !ctx.domain.expiresAt || !ctx.latest) return;
        const expiry = ctx.domain.expiresAt;
        const today = businessDate(now, policy.timeZone);
        const dueDay = businessDate(expiry, policy.timeZone);
        if (
          !existing &&
          today < addBusinessDays(dueDay, -policy.invoiceLeadDays)
        )
          return;
        if (existing) {
          const snapshot = existing.termsSnapshot;
          const storedPolicy = renewalAutomationPolicySchema.safeParse(
            snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
              ? snapshot.reminderPolicy
              : null,
          );
          if (!storedPolicy.success) {
            await this.review(
              tx,
              id,
              ctx.preference.reviewCode,
              'REMINDER_POLICY_REQUIRES_REVIEW',
            );
            return;
          }
          const reminderPolicy = storedPolicy.data;
          const reminderToday = businessDate(now, reminderPolicy.timeZone);
          const reminderDue = businessDate(expiry, reminderPolicy.timeZone);
          const invoice = await tx.invoice.findUniqueOrThrow({
            where: { id: existing.invoiceId },
          });
          if (
            !['UNPAID', 'OVERDUE'].includes(invoice.status) ||
            invoice.balanceDue <= 0n
          )
            return;
          // Do not emit a burst of old reminders after a missed scheduler window.
          // The invoice-created message is sufficient on its issue day.
          if (
            businessDate(
              invoice.issuedAt ?? invoice.createdAt,
              reminderPolicy.timeZone,
            ) >= reminderToday
          )
            return;
          const reminder = [...reminderPolicy.reminderDaysBeforeDue]
            .sort((a, b) => a - b)
            .find(
              (days) => reminderToday >= addBusinessDays(reminderDue, -days),
            );
          if (reminder === undefined) return;
          const reminded = await tx.outboxEvent.createMany({
            data: [
              {
                aggregateType: 'INVOICE',
                aggregateId: invoice.id,
                eventType: 'EMAIL_RENEWAL_REMINDER',
                idempotencyKey: `email:domain-renewal-reminder:${existing.id}:${reminder}`,
                payload: {
                  schemaVersion: 1,
                  invoiceId: invoice.id,
                  reminderNumber:
                    [...reminderPolicy.reminderDaysBeforeDue]
                      .sort((a, b) => b - a)
                      .indexOf(reminder) + 1,
                },
              },
            ],
            skipDuplicates: true,
          });
          return reminded.count === 1;
        }
        // Retain legacy issued invoices/reminders. New charges require explicitly
        // confirmed product identity; never reconstruct an older label here.
        if (!ctx.terms.productAttribution) return;
        const amount = BigInt(ctx.terms.amount);
        const end = addBillingPeriod(expiry, 'ANNUAL');
        const business = await tx.setting.findUnique({
          where: { key: 'business.identity' },
        });
        const invoice = await tx.invoice.create({
          data: {
            invoiceNumber: await allocateInvoiceNumber(tx),
            submissionKey: `domain-renewal:${id}:${expiry.toISOString()}:1`,
            customerId: customer.id,
            status: 'UNPAID',
            currency: 'BDT',
            subtotal: amount,
            total: amount,
            balanceDue: amount,
            customerNameSnapshot:
              customer.companyName ??
              `${customer.firstName} ${customer.lastName}`,
            customerEmailSnapshot: customer.user.email,
            customerAddressSnapshot: {
              line1: customer.addressLine1,
              line2: customer.addressLine2,
              city: customer.city,
              region: customer.region,
              postalCode: customer.postalCode,
              countryCode: customer.countryCode,
            },
            businessIdentitySnapshot: business?.value ?? { name: PROJECT_NAME },
            ...(customer.taxIdentifier
              ? {
                  taxIdentitySnapshot: {
                    taxIdentifier: customer.taxIdentifier,
                  },
                }
              : {}),
            issuedAt: now,
            dueAt: expiry,
            items: {
              create: {
                linePosition: 1,
                productAttributionSnapshot: ctx.terms.productAttribution,
                descriptionSnapshot: `Domain renewal: ${ctx.domain.domainName} · One year · Registrar renewal pending`,
                currency: 'BDT',
                quantity: 1,
                unitAmount: amount,
                lineTotal: amount,
                servicePeriodStart: expiry,
                servicePeriodEnd: end,
              },
            },
          },
        });
        const record = await tx.domainRenewalInvoice.create({
          data: {
            domainId: id,
            customerId: customer.id,
            invoiceId: invoice.id,
            sourceFactId: ctx.latest.id,
            termStart: expiry,
            termEnd: end,
            years: 1,
            termsSnapshot: { ...ctx.terms, reminderPolicy: policy },
            createdAt: now,
          },
        });
        await tx.outboxEvent.create({
          data: {
            aggregateType: 'INVOICE',
            aggregateId: invoice.id,
            eventType: 'EMAIL_INVOICE_CREATED',
            idempotencyKey: `email:domain-renewal-created:${record.id}`,
            payload: { schemaVersion: 1, invoiceId: invoice.id },
          },
        });
        await tx.activityLog.create({
          data: {
            action: 'DOMAIN_RENEWAL_INVOICE_CREATED',
            entityType: 'DOMAIN',
            entityId: id,
            metadata: {
              invoiceId: invoice.id,
              termStart: expiry.toISOString(),
              termEnd: end.toISOString(),
              amount: amount.toString(),
              externalDispatchEnabled: false,
            },
          },
        });
        return true;
      },
      { timeout: 20_000 },
    );
  }
  private async review(
    tx: Prisma.TransactionClient,
    id: string,
    previous: string | null,
    code: string | null,
  ) {
    if (previous === code) return;
    await tx.domainRenewalPreference.update({
      where: { domainId: id },
      data: { reviewCode: code },
    });
    if (code)
      await tx.activityLog.create({
        data: {
          action: 'DOMAIN_RENEWAL_BILLING_REVIEW_REQUIRED',
          entityType: 'DOMAIN',
          entityId: id,
          metadata: { code },
        },
      });
  }
}
