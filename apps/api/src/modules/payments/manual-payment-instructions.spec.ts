import type { PrismaClient } from '@webhost-billing/database';
import { readManualPaymentInstructions } from './manual-payment-instructions';

describe('manual payment instruction reads', () => {
  async function read(value: unknown) {
    const findUnique = jest
      .fn()
      .mockResolvedValue(value === undefined ? null : { value });
    const prisma = { setting: { findUnique } } as unknown as Pick<
      PrismaClient,
      'setting'
    >;
    const instructions = await readManualPaymentInstructions(prisma);
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: 'billing.manual-payment-instructions' },
      select: { value: true },
    });
    return instructions;
  }

  it('retains approved multiline text and preserves deliberate empty instructions', async () => {
    const instructions =
      'Fictional bank: TEST-1\nInvoice number and transaction ID\nManual proof contact';
    expect(await read({ instructions })).toBe(instructions);
    expect(await read({ instructions: '' })).toBe('');
  });

  it.each([
    undefined,
    null,
    { instructions: 42 },
    { instructions: 'x'.repeat(4001) },
    { instructions: 'valid', secret: 'unapproved' },
  ])(
    'uses the existing safe fallback for missing or invalid configuration',
    async (value) => {
      expect(await read(value)).toBe(
        'Pay by bank deposit, cash, or an approved mobile financial service, then submit the transaction reference for review.',
      );
    },
  );
});
