import { SettingCategory, type Prisma } from '@webhost-billing/database';
import {
  DEFAULT_BUSINESS_SETTINGS,
  formatInvoiceNumber,
  invoiceNumberingSettingsSchema,
} from '@webhost-billing/shared';

const KEY = 'billing.invoice-numbering';

export async function allocateInvoiceNumber(
  transaction: Prisma.TransactionClient,
): Promise<string> {
  await transaction.setting.upsert({
    where: { key: KEY },
    update: {},
    create: {
      key: KEY,
      category: SettingCategory.BILLING,
      value: DEFAULT_BUSINESS_SETTINGS.invoiceNumbering,
      description: 'Sequential numbering policy for future invoices.',
    },
  });
  await transaction.$queryRaw`
    SELECT "id" FROM "settings" WHERE "key" = ${KEY} FOR UPDATE
  `;
  const record = await transaction.setting.findUniqueOrThrow({
    where: { key: KEY },
    select: { value: true },
  });
  const parsed = invoiceNumberingSettingsSchema.safeParse(record.value);
  const settings = parsed.success
    ? parsed.data
    : DEFAULT_BUSINESS_SETTINGS.invoiceNumbering;
  const invoiceNumber = formatInvoiceNumber(settings);
  const nextNumber = settings.nextNumber + 1;
  const next = invoiceNumberingSettingsSchema.safeParse({
    ...settings,
    nextNumber,
  });
  if (!next.success) {
    throw new Error('Invoice numbering range has been exhausted.');
  }
  await transaction.setting.update({
    where: { key: KEY },
    data: { value: next.data },
  });
  return invoiceNumber;
}
