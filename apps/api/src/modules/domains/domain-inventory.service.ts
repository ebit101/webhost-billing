import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient } from '@webhost-billing/database';
import {
  createPaginationMeta,
  domainInventoryQuerySchema,
  domainInventoryResponseSchema,
  domainInventoryRowSchema,
  domainInventorySummarySchema,
  domainStates,
  type DomainInventoryQuery,
  type DomainInventoryRow,
} from '@webhost-billing/shared';
import { ApplicationException } from '../../common/errors/application.exception';
import { PRISMA_CLIENT } from '../../infrastructure/database/database.module';
import type { AuthRequestContext } from '../auth/auth.types';

type StoredRow = Omit<DomainInventoryRow, 'requestedAt' | 'expiresAt'> & {
  requestedAt: Date;
  expiresAt: Date | null;
};

@Injectable()
export class DomainInventoryService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async list(raw: DomainInventoryQuery, auth: AuthRequestContext) {
    // Match the existing administrator inventory grant, including internal callers.
    // Sensitive detail and provider-action MFA checks remain on their own endpoints.
    if (
      auth.identity.role !== 'ADMIN' ||
      auth.identity.staffRole !== 'FULL_ADMINISTRATOR'
    )
      throw new ApplicationException({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
        message: 'The domain inventory is unavailable.',
      });
    const query = domainInventoryQuerySchema.parse(raw);
    const conditions: Prisma.Sql[] = [];
    if (query.customerId)
      conditions.push(Prisma.sql`"customerId" = ${query.customerId}::uuid`);
    if (query.state) conditions.push(Prisma.sql`state = ${query.state}`);
    if (query.origin) conditions.push(Prisma.sql`origin = ${query.origin}`);
    if (query.search) {
      // Literal substring matching: user '%'/'_' characters are not SQL wildcards.
      const search = query.search;
      conditions.push(Prisma.sql`(
        strpos(lower("domainName"), lower(${search})) > 0 OR
        strpos(lower("customerName"), lower(${search})) > 0 OR
        strpos(lower("customerEmail"), lower(${search})) > 0 OR
        strpos(lower("customerNumber"), lower(${search})) > 0 OR
        strpos(lower(coalesce("companyName", '')), lower(${search})) > 0
      )`);
    }
    const where = conditions.length
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
      : Prisma.empty;
    // These legacy domain tables deliberately have no Prisma relation graph.
    // Project only the bounded list fields; never invoke detail/decryption per row.
    const inventory = Prisma.sql`WITH inventory AS (
      SELECT d.id, d.domain_name AS "domainName", d.customer_id AS "customerId",
        c.first_name || ' ' || c.last_name AS "customerName",
        c.customer_number AS "customerNumber", u.email AS "customerEmail",
        c.company_name AS "companyName", d.origin,
        CASE WHEN d.state = 'AWAITING_PAYMENT' AND i.status = 'PAID'
          THEN 'AWAITING_APPROVAL' ELSE d.state END AS state,
        coalesce(rp.name, CASE WHEN ra.mode = 'FAKE' THEN 'Simulated registrar'
          ELSE 'StarGate/UK2 (resell.biz)' END) AS registrar,
        ra.mode = 'FAKE' AS simulated, d.created_at AS "requestedAt",
        d.expires_at AS "expiresAt", i.id AS "invoiceId",
        i.status::text AS "invoiceStatus", i.balance_due::text AS "balanceDue",
        coalesce(i.currency, 'BDT') AS currency
      FROM domains d
      JOIN customers c ON c.id = d.customer_id
      JOIN users u ON u.id = c.user_id
      JOIN registrar_accounts ra ON ra.id = coalesce(d.execution_account_id, d.account_id)
      LEFT JOIN registrar_profiles rp ON rp.account_id = ra.id
      LEFT JOIN existing_domain_orders ed ON ed.domain_id = d.id
      LEFT JOIN invoices i ON i.id = coalesce(d.invoice_id, ed.invoice_id)
    )`;
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        const records = await tx.$queryRaw<StoredRow[]>(Prisma.sql`${inventory}
        SELECT * FROM inventory ${where}
        ORDER BY "requestedAt" DESC, id DESC
        LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`);
        const groups = await tx.$queryRaw<
          { state: string; count: string }[]
        >(Prisma.sql`${inventory}
        SELECT state, count(*)::text AS count FROM inventory ${where} GROUP BY state`);
        const counts: Record<string, number> = Object.fromEntries(
          domainStates.map((state) => [state, 0]),
        );
        for (const group of groups) {
          if (!domainStates.some((state) => state === group.state))
            throw new Error('Unknown stored domain state.');
          counts[group.state] = Number(group.count);
        }
        const summary = domainInventorySummarySchema.parse(counts);
        const total = Object.values(summary).reduce(
          (sum, value) => sum + value,
          0,
        );
        return domainInventoryResponseSchema.parse({
          success: true,
          data: records.map((record) =>
            domainInventoryRowSchema.parse({
              ...record,
              requestedAt: record.requestedAt.toISOString(),
              expiresAt: record.expiresAt?.toISOString() ?? null,
            }),
          ),
          pagination: createPaginationMeta(query.page, query.pageSize, total),
          summary,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: 2000,
        timeout: 10000,
      },
    );
  }
}
