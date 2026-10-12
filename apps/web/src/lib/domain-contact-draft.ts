import type { CustomerDetail, DomainContact } from '@webhost-billing/shared';

export function domainContactDraft(customer: CustomerDetail): DomainContact {
  // Do not guess the calling-code boundary of legacy unseparated phone numbers.
  const phone = /^\+([1-9][0-9]{0,2})[.\s]([0-9]{4,12})$/.exec(
    customer.phone ?? '',
  );
  return {
    name: `${customer.firstName} ${customer.lastName}`,
    company: customer.companyName ?? '',
    email: customer.email,
    address: customer.addressLine1,
    addressLine2: customer.addressLine2 ?? '',
    city: customer.city,
    region: customer.region ?? '',
    postalCode: customer.postalCode ?? '',
    country: customer.countryCode,
    phoneCountryCode: phone?.[1] ?? '',
    phone: phone?.[2] ?? '',
  };
}
