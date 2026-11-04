'use client';

import {
  MAX_CHECKOUT_ADD_ONS,
  type PublicHostingAddOn,
} from '@webhost-billing/shared';
import { formatMinor } from './order-ui';

export function HostingAddOnOptions({
  offers,
  selected,
  onChange,
  busy,
}: {
  offers: PublicHostingAddOn[];
  selected: string[];
  onChange: (ids: string[]) => void;
  busy?: boolean;
}) {
  if (!offers.length) return null;
  return (
    <fieldset
      disabled={busy}
      className="grid gap-3 border-t border-slate-200 pt-4"
    >
      <legend className="text-sm font-bold text-slate-950">
        Optional add-ons
      </legend>
      {offers.map((offer) => {
        const checked = selected.includes(offer.priceId);
        return (
          <label
            key={offer.priceId}
            className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && selected.length >= MAX_CHECKOUT_ADD_ONS}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter((id) => id !== offer.priceId)
                    : [...selected, offer.priceId],
                )
              }
            />
            <span>
              <strong>{offer.name}</strong> ·{' '}
              {formatMinor(offer.amount.amount, offer.amount.currency)} one time
              {offer.description && (
                <span className="block text-slate-600">
                  {offer.description}
                </span>
              )}
            </span>
          </label>
        );
      })}
      {selected.length >= MAX_CHECKOUT_ADD_ONS && (
        <p className="text-sm text-slate-600">
          You can choose up to {MAX_CHECKOUT_ADD_ONS} add-ons per order.
        </p>
      )}
    </fieldset>
  );
}
