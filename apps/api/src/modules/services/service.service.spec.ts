import { isServiceTransitionAllowed } from './service.service';
import { nextServiceDueAt } from './service-period';

describe('service state rules', () => {
  it('allows only explicit lifecycle transitions', () => {
    expect(isServiceTransitionAllowed('PENDING', 'PROVISIONING')).toBe(true);
    expect(isServiceTransitionAllowed('PROVISIONING', 'ACTIVE')).toBe(true);
    expect(isServiceTransitionAllowed('PROVISIONING', 'PROVISION_FAILED')).toBe(
      true,
    );
    expect(isServiceTransitionAllowed('PROVISION_FAILED', 'PROVISIONING')).toBe(
      true,
    );
    expect(isServiceTransitionAllowed('ACTIVE', 'SUSPENDED')).toBe(true);
    expect(isServiceTransitionAllowed('SUSPENDED', 'ACTIVE')).toBe(true);
    expect(isServiceTransitionAllowed('ACTIVE', 'TERMINATED')).toBe(true);
    expect(isServiceTransitionAllowed('PENDING', 'ACTIVE')).toBe(false);
    expect(isServiceTransitionAllowed('TERMINATED', 'ACTIVE')).toBe(false);
    expect(isServiceTransitionAllowed('CANCELLED', 'PROVISIONING')).toBe(false);
  });

  it('calculates UTC renewal dates with month-end clamping', () => {
    expect(
      nextServiceDueAt(
        new Date('2028-01-31T12:30:00.000Z'),
        'MONTHLY',
      ).toISOString(),
    ).toBe('2028-02-29T12:30:00.000Z');
    expect(
      nextServiceDueAt(
        new Date('2027-11-30T08:00:00.000Z'),
        'QUARTERLY',
      ).toISOString(),
    ).toBe('2028-02-29T08:00:00.000Z');
    expect(
      nextServiceDueAt(
        new Date('2028-02-29T00:00:00.000Z'),
        'ANNUAL',
      ).toISOString(),
    ).toBe('2029-02-28T00:00:00.000Z');
  });
});
