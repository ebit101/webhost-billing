// Registry-specific contact types/eligibility attributes need their own reviewed
// input flow. Opening catalogue pricing must not silently invent those facts.
// Reference: https://manage.resellerclub.com/kb/answer/752 (Register).
const additionalDetails = new Set([
  'aero',
  'asia',
  'au',
  'ca',
  'cn',
  'coop',
  'de',
  'es',
  'eu',
  'fr',
  'hu',
  'it',
  'jobs',
  'nl',
  'nyc',
  'pro',
  'quebec',
  'ru',
  'tel',
  'travel',
  'uk',
  'us',
  'xxx',
  'attorney',
  'dentist',
  'lawyer',
  'ltda',
  'srl',
  'law',
]);

export function standardRegistryContactSupported(tld: string): boolean {
  return !additionalDetails.has(tld.split('.').at(-1) ?? '');
}

export function requireStandardRegistryContact(tld: string): void {
  if (!standardRegistryContactSupported(tld)) {
    throw new Error(
      `.${tld} pricing can be configured, but registration requires registry-specific contact or eligibility details that this form does not collect.`,
    );
  }
}
