import type { ReactNode } from 'react';
export const contactFields = [
  'name',
  'company',
  'address',
  'addressLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'email',
  'phoneCountryCode',
  'phone',
] as const;
export const labels: Record<(typeof contactFields)[number], string> = {
  name: 'Registrant name',
  company: 'Company',
  address: 'Address',
  addressLine2: 'Address line 2',
  city: 'City',
  region: 'Region',
  postalCode: 'Postal code',
  country: 'Country code',
  email: 'Registrant email',
  phoneCountryCode: 'Phone country code',
  phone: 'Phone number',
};
export const money = (amount: string, currency: string) =>
  `${currency} ${BigInt(amount) / 100n}.${(BigInt(amount) % 100n).toString().padStart(2, '0')}`;
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}
