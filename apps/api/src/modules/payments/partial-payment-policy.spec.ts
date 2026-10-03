import type { Prisma } from '@webhost-billing/database';
import { PARTIAL_PAYMENT_POLICY_CONFIRMATION } from '@webhost-billing/shared';
import type { AuthRequestContext } from '../auth/auth.types';
import { updatePartialPaymentPolicy } from './partial-payment-policy';

const actor: AuthRequestContext = {
  identity: {
    userId: '10000000-0000-4000-8000-000000000079',
    email: 'policy@example.test',
    role: 'ADMIN',
    adminProfileId: '10000000-0000-4000-8000-000000000080',
  },
  sessionId: 'fictional-session',
};
const context = {
  ipAddressHash: 'fictional-hash',
  userAgent: 'sensitive-test-agent',
};

function fixture(previous?: boolean) {
  const mocks = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    setting: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          previous === undefined
            ? null
            : { value: { partialPaymentsEnabled: previous } },
        ),
      upsert: jest
        .fn<Promise<unknown>, [Prisma.SettingUpsertArgs]>()
        .mockResolvedValue({}),
    },
    activityLog: {
      create: jest
        .fn<Promise<unknown>, [Prisma.ActivityLogCreateArgs]>()
        .mockResolvedValue({}),
    },
  };
  return { mocks, transaction: mocks as unknown as Prisma.TransactionClient };
}

describe('partial-payment policy transition', () => {
  it.each([false, true])(
    'requires confirmation when changing stored %s',
    async (previous) => {
      const { mocks, transaction } = fixture(previous);
      await expect(
        updatePartialPaymentPolicy(
          transaction,
          !previous,
          undefined,
          actor,
          context,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(mocks.setting.upsert).not.toHaveBeenCalled();
      expect(mocks.activityLog.create).not.toHaveBeenCalled();
    },
  );

  it.each([false, true, undefined])(
    'leaves unchanged %s policy without writes or transition audit',
    async (previous) => {
      const { mocks, transaction } = fixture(previous);
      await updatePartialPaymentPolicy(
        transaction,
        previous ?? false,
        undefined,
        actor,
        context,
      );
      expect(mocks.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mocks.setting.upsert).not.toHaveBeenCalled();
      expect(mocks.activityLog.create).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'persists confirmed transition from %s with one safe audit',
    async (previous) => {
      const { mocks, transaction } = fixture(previous);
      await updatePartialPaymentPolicy(
        transaction,
        !previous,
        PARTIAL_PAYMENT_POLICY_CONFIRMATION,
        actor,
        context,
      );
      expect(mocks.setting.upsert).toHaveBeenCalledTimes(1);
      expect(mocks.setting.upsert.mock.calls[0]?.[0].update.value).toEqual({
        partialPaymentsEnabled: !previous,
      });
      expect(mocks.activityLog.create).toHaveBeenCalledTimes(1);
      expect(mocks.activityLog.create.mock.calls[0]?.[0].data.metadata).toEqual(
        {
          previousPartialPaymentsEnabled: previous,
          partialPaymentsEnabled: !previous,
        },
      );
    },
  );
});
