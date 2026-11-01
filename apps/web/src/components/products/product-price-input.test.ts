import { describe, expect, it } from 'vitest';
import {
  priceForInput,
  priceToMinor,
  productPriceFromForm,
} from './product-price-input';

describe('product price entry', () => {
  it.each([
    ['1500', 'BDT', '150000', '1500.00'],
    ['1500.05', 'BDT', '150005', '1500.05'],
    ['0001.2', 'BDT', '120', '1.20'],
    ['0', 'BDT', '0', '0.00'],
    ['1500', 'JPY', '1500', '1500'],
    ['1.234', 'KWD', '1234', '1.234'],
    [
      '92233720368547758.07',
      'BDT',
      '9223372036854775807',
      '92233720368547758.07',
    ],
  ])(
    'converts %s %s exactly and reversibly',
    (input, currency, minor, display) => {
      expect(priceToMinor(input, currency, 'Price')).toBe(minor);
      expect(priceForInput(minor, currency)).toBe(display);
    },
  );

  it.each([
    ['-1', 'BDT'],
    ['1.001', 'BDT'],
    ['1,500', 'BDT'],
    ['1e3', 'BDT'],
    ['NaN', 'BDT'],
    ['', 'BDT'],
    ['1.', 'BDT'],
    ['1.1', 'JPY'],
    ['92233720368547758.08', 'BDT'],
    ['1', 'not-a-currency'],
  ])('rejects invalid or unrepresentable %s %s', (input, currency) => {
    expect(() => priceToMinor(input, currency, 'Price')).toThrow();
  });

  it('normalizes the currency and preserves the existing integer-string API', () => {
    expect(
      productPriceFromForm({
        billingPeriod: 'MONTHLY',
        currency: ' bdt ',
        amount: '1500.25',
        setupFee: '50.05',
      }),
    ).toEqual({
      billingPeriod: 'MONTHLY',
      currency: 'BDT',
      amount: '150025',
      setupFee: '5005',
    });
    expect(
      productPriceFromForm({
        billingPeriod: 'ANNUAL',
        currency: 'BDT',
        amount: '1890',
        setupFee: '',
      }).setupFee,
    ).toBe('0');
    expect(() =>
      productPriceFromForm({
        billingPeriod: 'MONTHLY',
        currency: 'BDT',
        amount: '0',
      }),
    ).toThrow('Price must be greater than zero.');
  });
});
