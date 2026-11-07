import type { PrismaClient } from '@webhost-billing/database';
import type { AuthRequestContext } from '../auth/auth.types';
import type { SettingsService } from '../settings/settings.service';
import { OperationalReportService } from './operational-report.service';

const admin: AuthRequestContext = {
  sessionId: 'fictional',
  identity: {
    role: 'ADMIN',
    userId: '22400000-0000-4000-8000-000000000001',
    email: 'reports@example.test',
    adminProfileId: '22400000-0000-4000-8000-000000000002',
    staffRole: 'FULL_ADMINISTRATOR',
    twoFactorEnabled: false,
  },
};
const context = { ipAddressHash: 'fictional-report-unit' };
function setup(total = '1') {
  const query = jest.fn().mockResolvedValue([
    {
      total,
      totals: ['', '', '9007199254740993'],
      rows: [
        {
          id: 'fictional',
          cells: [' =Fictional host', 'Hosting', '9007199254740993'],
        },
      ],
    },
  ]);
  const audit = jest.fn().mockResolvedValue({ id: 'audit' });
  const settings = {
    overview: jest
      .fn()
      .mockResolvedValue({ currency: 'BDT', timeZone: 'Asia/Dhaka' }),
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $executeRaw: jest.fn().mockResolvedValue(0), $queryRaw: query }),
    ),
    activityLog: { create: audit },
  };
  return {
    service: new OperationalReportService(
      prisma as unknown as PrismaClient,
      settings as unknown as SettingsService,
    ),
    prisma,
    audit,
    settings,
  };
}
describe('operational report access and safe export boundaries', () => {
  it('refuses a non-full administrator before settings or database reads', async () => {
    const f = setup();
    await expect(
      f.service.list(
        'income',
        { page: 1, pageSize: 20 },
        { ...admin, supportAdministratorId: admin.identity.userId },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.settings.overview).not.toHaveBeenCalled();
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });
  it('refuses an oversized export without partial output or an export audit', async () => {
    const f = setup('10001');
    await expect(
      f.service.exportCsv('income', {}, admin, context),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.audit).not.toHaveBeenCalled();
  });
  it('keeps amounts beyond Number precision exact, escapes labels and requires a successful audit', async () => {
    const f = setup();
    const csv = await f.service.exportCsv(
      'income',
      { from: '2028-04-01', to: '2028-04-01' },
      admin,
      context,
    );
    expect(csv.body).toContain('"9007199254740993"');
    expect(csv.body).toContain('"\' =Fictional host"');
    expect(f.audit).toHaveBeenCalledTimes(1);
    f.audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await expect(
      f.service.exportCsv('income', {}, admin, context),
    ).rejects.toThrow('Audit unavailable');
  });
});
