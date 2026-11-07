'use client';

import {
  MAX_CHECKOUT_ADD_ONS,
  type PublicHostingAddOn,
} from '@webhost-billing/shared';
import { addOnPeriodLabel, formatMinor } from './order-ui';

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
  const groups = new Map<string, PublicHostingAddOn[]>();
  const extras = offers.filter((offer) => !offer.configuration);
  for (const offer of offers) {
    if (offer.configuration)
      groups.set(offer.configuration.groupKey, [
        ...(groups.get(offer.configuration.groupKey) ?? []),
        offer,
      ]);
  }
  return (
    <div className="grid gap-4">
      {[...groups].map(([key, choices]) => {
        const current = choices.find((choice) =>
          selected.includes(choice.priceId),
        );
        return (
          <fieldset
            key={key}
            disabled={busy}
            className="grid gap-2 rounded-xl border border-slate-200 p-4"
          >
            <legend className="px-1 text-sm font-bold">
              {choices[0]?.configuration?.groupName}
            </legend>
            <label className="text-sm font-semibold">
              {choices[0]?.configuration?.groupName} choice
              <select
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                value={current?.priceId ?? ''}
                onChange={(event) =>
                  onChange([
                    ...selected.filter(
                      (id) => !choices.some((choice) => choice.priceId === id),
                    ),
                    ...(event.target.value ? [event.target.value] : []),
                  ])
                }
              >
                <option value="">Use the included plan configuration</option>
                {choices.map((choice) => (
                  <option
                    key={choice.priceId}
                    value={choice.priceId}
                    disabled={
                      !current && selected.length >= MAX_CHECKOUT_ADD_ONS
                    }
                  >
                    {choice.configuration?.choiceName} ·{' '}
                    {formatMinor(choice.amount.amount, choice.amount.currency)}{' '}
                    {addOnPeriodLabel(choice.billingPeriod)}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-slate-600">
              Manual configuration after payment and hosting setup.{' '}
              {current?.configuration?.fulfillmentNote ??
                'Choose at most one value; leaving this unchanged adds no charge.'}
            </p>
          </fieldset>
        );
      })}
      {extras.length > 0 && (
        <fieldset
          disabled={busy}
          className="grid gap-3 border-t border-slate-200 pt-4"
        >
          <legend className="text-sm font-bold text-slate-950">
            Optional add-ons
          </legend>
          {extras.map((offer) => {
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
                  {formatMinor(offer.amount.amount, offer.amount.currency)}{' '}
                  {addOnPeriodLabel(offer.billingPeriod)}
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
      )}
    </div>
  );
}
