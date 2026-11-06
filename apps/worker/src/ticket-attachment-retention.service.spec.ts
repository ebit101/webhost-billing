import type { PrismaClient } from '@webhost-billing/database';
import { TicketAttachmentRetentionService } from './ticket-attachment-retention.service';

it('starts bounded retention independently of billing automation and stops its timer', async () => {
  jest.useFakeTimers();
  const transaction = jest.fn().mockResolvedValue(0);
  const service = new TicketAttachmentRetentionService({
    $transaction: transaction,
  } as unknown as PrismaClient);
  try {
    service.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(60000);
    expect(transaction).toHaveBeenCalledTimes(2);
    await service.onApplicationShutdown();
    await jest.advanceTimersByTimeAsync(60000);
    expect(transaction).toHaveBeenCalledTimes(2);
  } finally {
    jest.useRealTimers();
  }
});
