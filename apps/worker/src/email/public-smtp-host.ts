import { Resolver } from 'node:dns/promises';
import { BlockList, isIPv4 } from 'node:net';
import { smtpHostSchema } from '@webhost-billing/shared';
import { EmailProviderError } from './email-provider.error';

const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4');

export async function resolvePublicSmtpHost(
  host: string,
  lookup: (host: string) => Promise<string[]> = resolveAddresses,
): Promise<string> {
  if (!smtpHostSchema.safeParse(host).success) throw denied();
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    throw new EmailProviderError('TEMPORARY', 'SMTP_DNS_UNAVAILABLE');
  }
  if (
    addresses.length === 0 ||
    addresses.length > 32 ||
    addresses.some(
      (address) => !isIPv4(address) || blocked.check(address, 'ipv4'),
    )
  )
    throw denied();
  return addresses[0];
}
async function resolveAddresses(host: string) {
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  const timer = setTimeout(() => resolver.cancel(), 2500);
  try {
    return await resolver.resolve4(host);
  } finally {
    clearTimeout(timer);
  }
}
function denied() {
  return new EmailProviderError('PERMANENT', 'SMTP_DESTINATION_NOT_PUBLIC');
}
