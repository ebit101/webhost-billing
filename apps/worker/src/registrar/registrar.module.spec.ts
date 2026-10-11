import type { WorkerEnvironment } from '@webhost-billing/config';
import type { PrismaClient } from '@webhost-billing/database';
import { BackgroundWorker } from '@webhost-billing/queue';
import { RegistrarConsumer } from './registrar.module';

describe('RegistrarConsumer production boundary', () => {
  it('does not register a simulated consumer or connect to Redis in production', async () => {
    const register = jest.spyOn(BackgroundWorker.prototype, 'register');
    try {
      const consumer = new RegistrarConsumer(
        {
          NODE_ENV: 'production',
          REDIS_URL: 'redis://127.0.0.1:1',
          BULLMQ_PREFIX: 'fictional-registrar-production-gate',
          CREDENTIAL_ENCRYPTION_KEY: 'fictional-test-key',
        } as WorkerEnvironment,
        {} as PrismaClient,
      );
      consumer.onApplicationBootstrap();
      expect(register).not.toHaveBeenCalled();
      await consumer.onApplicationShutdown();
    } finally {
      register.mockRestore();
    }
  });
});
