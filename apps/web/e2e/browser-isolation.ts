// These workflows deliberately change installation-wide registrar state or
// consume seeded login limits. Each gets its own marked fictional schema.
export const isolatedBrowserGroups = [
  'domain-administration',
  'domain-registration',
  'domain-facts',
  'domain-renewals',
  'domain-renewal-execution',
  'ticket-attachments',
] as const;

export function browserIsolationPatterns(group: string | undefined) {
  if (!group) return {};
  if (group === 'core')
    return {
      testIgnore: isolatedBrowserGroups.map((name) => `**/${name}.spec.ts`),
    };
  if (!isolatedBrowserGroups.some((name) => name === group))
    throw new Error('Unknown browser acceptance isolation group.');
  return { testMatch: `**/${group}.spec.ts` };
}
