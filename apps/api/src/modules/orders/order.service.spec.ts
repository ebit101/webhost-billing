import {
  createHumanReadableNumber,
  isOrderTransitionAllowed,
} from './order.service';

describe('order rules', () => {
  it('creates readable numbers with date and 64 bits of entropy', () => {
    expect(
      createHumanReadableNumber(
        'ORD',
        new Date('2026-08-24T12:34:56.000Z'),
        Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 255]),
      ),
    ).toBe('ORD-20260824-00010203040506FF');
  });

  it('allows only explicit state transitions', () => {
    expect(isOrderTransitionAllowed('AWAITING_PAYMENT', 'PAID')).toBe(true);
    expect(isOrderTransitionAllowed('PAID', 'PROCESSING')).toBe(true);
    expect(isOrderTransitionAllowed('PROCESSING', 'COMPLETED')).toBe(true);
    expect(isOrderTransitionAllowed('COMPLETED', 'PROCESSING')).toBe(false);
    expect(isOrderTransitionAllowed('AWAITING_PAYMENT', 'COMPLETED')).toBe(
      false,
    );
  });
});
