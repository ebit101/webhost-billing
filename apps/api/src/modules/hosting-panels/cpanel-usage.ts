import { z } from 'zod';
import type {
  HostingUsageMetric,
  HostingUsageSample,
} from '@webhost-billing/shared';
import type {
  CpanelWhmHttpClient,
  WhmApiEnvelope,
} from './cpanel-whm-http.client';
import type {
  HostingAccountReference,
  HostingPanelConnection,
} from './hosting-panel.interface';
import { HostingPanelProviderError } from './hosting-panel.error';

const scalar = z.union([z.string(), z.number()]);
const accountSchema = z.object({
  user: z.string(),
  domain: z.string(),
  diskused: z.unknown().optional(),
  disklimit: z.unknown().optional(),
});
const bandwidthSchema = z.object({
  month: scalar,
  year: scalar,
  acct: z.array(
    z.object({
      user: z.string(),
      maindomain: z.string(),
      deleted: scalar.optional(),
      totalbytes: z.unknown().optional(),
      limit: z.unknown().optional(),
    }),
  ),
});

/** Reject unsafe numeric JSON rather than rounding a provider's byte count. */
export function usageBytes(
  value: unknown,
  unit: 'BYTES' | 'MIB',
): string | null {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0))
    return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  const match =
    unit === 'MIB'
      ? /^(\d{1,22})(?:\.(\d{1,6}))?\s*M?$/i.exec(text)
      : /^(\d{1,29})$/.exec(text);
  if (!match) return null;
  const fraction = match[2] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const result =
    ((BigInt(match[1]) * scale + BigInt(fraction || '0')) *
      (unit === 'MIB' ? 1048576n : 1n)) /
    scale;
  return result.toString();
}
export function usageMetric(
  used: unknown,
  limit: unknown,
  unit: 'BYTES' | 'MIB',
): HostingUsageMetric | null {
  const usedBytes = usageBytes(used, unit);
  const unlimited =
    typeof limit === 'string' && limit.trim().toLowerCase() === 'unlimited';
  const limitBytes = unlimited ? null : usageBytes(limit, unit);
  if (usedBytes === null && limitBytes === null && !unlimited) return null;
  return {
    usedBytes,
    limitBytes,
    limitKind: unlimited
      ? 'UNLIMITED'
      : limitBytes !== null
        ? 'LIMITED'
        : 'UNKNOWN',
  };
}
function invalid(): never {
  throw new HostingPanelProviderError(
    'TEMPORARY',
    'PANEL_USAGE_UNAVAILABLE',
    'Hosting usage could not be verified.',
  );
}
function success(response: WhmApiEnvelope): unknown {
  if (response.metadata.result !== 1 && response.metadata.result !== '1')
    invalid();
  return response.data;
}
export async function readCpanelUsage(
  http: CpanelWhmHttpClient,
  connection: HostingPanelConnection,
  reference: HostingAccountReference,
  period: string,
): Promise<HostingUsageSample> {
  if (
    !/^[a-z][a-z0-9_]{0,63}$/i.test(reference.username) ||
    reference.externalAccountId !== reference.username ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
  )
    invalid();
  const summary = z
    .object({ acct: z.array(accountSchema).length(1) })
    .safeParse(
      success(
        await http.call(
          connection,
          'accountsummary',
          { user: reference.username },
          false,
        ),
      ),
    );
  if (!summary.success) invalid();
  const account = summary.data.acct[0];
  if (
    account.user !== reference.username ||
    account.domain.toLowerCase() !== reference.domain.toLowerCase()
  )
    invalid();
  const [year, month] = period.split('-');
  const bandwidth = bandwidthSchema.safeParse(
    success(
      await http.call(
        connection,
        'showbw',
        {
          searchtype: 'user',
          search: `^${reference.username}$`,
          year: year,
          month: String(Number(month)),
        },
        false,
      ),
    ),
  );
  if (
    !bandwidth.success ||
    String(bandwidth.data.year) !== year ||
    Number(bandwidth.data.month) !== Number(month)
  )
    invalid();
  // Filtering is defense in depth: never select the first row from another account.
  if (bandwidth.data.acct.length > 1) invalid();
  const row = bandwidth.data.acct[0];
  if (
    row &&
    (row.user !== reference.username ||
      row.maindomain.toLowerCase() !== reference.domain.toLowerCase() ||
      String(row.deleted ?? 0) !== '0')
  )
    invalid();
  return {
    disk: usageMetric(account.diskused, account.disklimit, 'MIB'),
    bandwidth: row ? usageMetric(row.totalbytes, row.limit, 'BYTES') : null,
    bandwidthPeriod: period,
  };
}
