import { describe, expect, it } from 'vitest';
import type { CustomerDetail } from '@webhost-billing/shared';
import { domainContactDraft } from './domain-contact-draft';

const customer = {
  firstName: 'Fictional',
  lastName: 'Registrant',
  companyName: null,
  email: 'fictional@example.test',
  addressLine1: '1 Test Street',
  addressLine2: 'Floor 2',
  city: 'Dhaka',
  region: null,
  postalCode: '1000',
  countryCode: 'BD',
  phone: '+880.1700000000',
} as CustomerDetail;
describe('registrant contact prefill', () => {
  it('preserves both address lines and explicit phone boundaries without inventing missing fields', () => {
    expect(domainContactDraft(customer)).toEqual({
      name: 'Fictional Registrant',
      company: '',
      email: customer.email,
      address: customer.addressLine1,
      addressLine2: 'Floor 2',
      city: 'Dhaka',
      region: '',
      postalCode: '1000',
      country: 'BD',
      phoneCountryCode: '880',
      phone: '1700000000',
    });
  });
  it('does not guess, truncate or repurpose legacy unseparated or invalid phone values', () => {
    for (const phone of [
      '+8801700000000',
      '1700000000',
      null,
      '+880.17000000000000',
    ]) {
      const draft = domainContactDraft({ ...customer, phone });
      expect(draft.phoneCountryCode).toBe('');
      expect(draft.phone).toBe('');
      expect(customer.phone).toBe('+880.1700000000');
    }
  });
});
