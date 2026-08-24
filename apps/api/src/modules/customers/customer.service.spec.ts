import { UserStatus } from '@webhost-billing/database';
import { accountStatusAfterActivation } from './customer.service';

describe('customer management business rules', () => {
  it('does not treat access activation as proof of email verification', () => {
    expect(accountStatusAfterActivation(null)).toBe(
      UserStatus.PENDING_VERIFICATION,
    );
  });

  it('restores an already verified account to active access', () => {
    expect(accountStatusAfterActivation(new Date())).toBe(UserStatus.ACTIVE);
  });
});
