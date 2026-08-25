import { majorToMinor, minorToMajor } from './payment-money';

describe('payment provider money conversion', () => {
  it('converts through decimal strings without floating-point arithmetic', () => {
    expect(minorToMajor(12_345n)).toBe('123.45');
    expect(majorToMinor('123.45')).toBe(12_345n);
    expect(majorToMinor('10')).toBe(1_000n);
  });

  it('rejects provider amounts with excessive precision', () => {
    expect(() => majorToMinor('1.001')).toThrow();
  });
});
