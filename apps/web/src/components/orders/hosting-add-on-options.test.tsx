import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { PublicHostingAddOn } from '@webhost-billing/shared';
import { HostingAddOnOptions } from './hosting-add-on-options';
import { formatHostingSubtotal } from './order-ui';

const choice = {
  version: 1 as const,
  groupKey: 'storage',
  groupName: 'Storage tier',
  choiceName: '20 GiB',
  fulfillment: 'MANUAL' as const,
  fulfillmentNote: 'Our team applies this after setup.',
};
const base: PublicHostingAddOn = {
  id: '22300000-0000-4000-8000-000000000001',
  priceId: '22300000-0000-4000-8000-000000000002',
  name: 'Storage',
  description: null,
  amount: { amount: '25000', currency: 'BDT' },
  billingPeriod: 'MONTHLY',
  configuration: choice,
};
const larger = {
  ...base,
  id: '22300000-0000-4000-8000-000000000003',
  priceId: '22300000-0000-4000-8000-000000000004',
  configuration: { ...choice, choiceName: '40 GiB' },
  amount: { amount: '40000', currency: 'BDT' },
};
const backup: PublicHostingAddOn = {
  ...base,
  id: '22300000-0000-4000-8000-000000000005',
  priceId: '22300000-0000-4000-8000-000000000006',
  configuration: undefined,
  name: 'Managed backup',
};
function Form({ initial = [] as string[], busy = false }) {
  const [selected, setSelected] = useState(initial);
  return (
    <>
      <HostingAddOnOptions
        offers={[base, larger, backup]}
        selected={selected}
        onChange={setSelected}
        busy={busy}
      />
      <output aria-label="Selection">{selected.join(',')}</output>
    </>
  );
}
describe('configurable checkout choices', () => {
  it('starts with included configuration and swaps one selected value without removing other add-ons', async () => {
    const user = userEvent.setup();
    render(<Form initial={[backup.priceId]} />);
    const select = screen.getByRole('combobox', {
      name: 'Storage tier choice',
    }) as HTMLSelectElement;
    expect(select.value).toBe('');
    await user.selectOptions(select, base.priceId);
    expect(screen.getByLabelText('Selection').textContent).toBe(
      `${backup.priceId},${base.priceId}`,
    );
    await user.selectOptions(select, larger.priceId);
    expect(screen.getByLabelText('Selection').textContent).toBe(
      `${backup.priceId},${larger.priceId}`,
    );
    await user.selectOptions(select, '');
    expect(screen.getByLabelText('Selection').textContent).toBe(backup.priceId);
    expect(screen.getByText(/Manual configuration after payment/)).toBeTruthy();
  });
  it('keeps ordinary add-on checkboxes and shows manual instructions for a selected option', async () => {
    render(<Form initial={[base.priceId]} />);
    expect(
      screen.getByRole('checkbox', { name: /Managed backup/ }),
    ).toBeTruthy();
    expect(screen.getByText(/Our team applies this after setup/)).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: /^Storage/ })).toBeNull();
  });
  it('allows swapping at the selection limit and blocks adding another group', () => {
    const initial = [
      base.priceId,
      ...Array.from({ length: 9 }, (_, i) => `other-${i}`),
    ];
    render(<Form initial={initial} />);
    expect(
      (screen.getByRole('option', { name: /40 GiB/ }) as HTMLOptionElement)
        .disabled,
    ).toBe(false);
    expect(
      (
        screen.getByRole('checkbox', {
          name: /Managed backup/,
        }) as HTMLInputElement
      ).disabled,
    ).toBe(true);
  });
  it('disables configuration controls while checkout is busy', () => {
    render(<Form busy />);
    expect(screen.getByRole('combobox').closest('fieldset')?.disabled).toBe(
      true,
    );
  });
  it('uses the existing exact order subtotal and includes only the chosen value', () => {
    const price = {
      id: base.priceId,
      billingPeriod: 'MONTHLY' as const,
      amount: { amount: '100000', currency: 'BDT' },
      setupFee: { amount: '10000', currency: 'BDT' },
      validFrom: null,
      validUntil: null,
      createdAt: '2026-11-07T00:00:00Z',
    };
    expect(formatHostingSubtotal(price, [base, backup])).toBe('BDT 1,600.00');
    expect(formatHostingSubtotal(price, [larger])).toBe('BDT 1,500.00');
  });
});
