import type { CustomerDetail } from '@webhost-billing/shared';
import type { ChangeEventHandler, ReactNode } from 'react';

export const fieldClass =
  'mt-1.5 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100';

export function Field({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  autoComplete?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <input
        className={fieldClass}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
    </label>
  );
}

export function ProfileFields({ customer }: { customer?: CustomerDetail }) {
  return (
    <>
      <Field
        label="First name"
        name="firstName"
        required
        defaultValue={customer?.firstName}
        autoComplete="given-name"
      />
      <Field
        label="Last name"
        name="lastName"
        required
        defaultValue={customer?.lastName}
        autoComplete="family-name"
      />
      <Field
        label="Company"
        name="companyName"
        defaultValue={customer?.companyName ?? ''}
        autoComplete="organization"
      />
      <Field
        label="Phone"
        name="phone"
        defaultValue={customer?.phone ?? ''}
        autoComplete="tel"
      />
      <div className="sm:col-span-2">
        <Field
          label="Address"
          name="addressLine1"
          required
          defaultValue={customer?.addressLine1}
          autoComplete="address-line1"
        />
      </div>
      <div className="sm:col-span-2">
        <Field
          label="Address line 2"
          name="addressLine2"
          defaultValue={customer?.addressLine2 ?? ''}
          autoComplete="address-line2"
        />
      </div>
      <Field
        label="City"
        name="city"
        required
        defaultValue={customer?.city}
        autoComplete="address-level2"
      />
      <Field
        label="Region"
        name="region"
        defaultValue={customer?.region ?? ''}
        autoComplete="address-level1"
      />
      <Field
        label="Postal code"
        name="postalCode"
        defaultValue={customer?.postalCode ?? ''}
        autoComplete="postal-code"
      />
      <Field
        label="Country code"
        name="countryCode"
        required
        defaultValue={customer?.countryCode ?? 'BD'}
        autoComplete="country"
      />
    </>
  );
}

export function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-bold text-slate-950">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      ) : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

export function valuesFromForm(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries());
}

export function nullableProfileValues(form: HTMLFormElement) {
  const raw = valuesFromForm(form);
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      ['companyName', 'phone', 'addressLine2', 'region', 'postalCode'].includes(
        key,
      ) && value === ''
        ? null
        : value,
    ]),
  );
}
