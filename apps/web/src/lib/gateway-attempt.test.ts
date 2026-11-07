import { beforeEach, expect, it, vi } from 'vitest';
import { gatewayAttemptKey, clearGatewayAttempt } from './gateway-attempt';
beforeEach(() => sessionStorage.clear());
it('reuses one invoice/provider attempt across retries and component remounts', () => {
  const first = gatewayAttemptKey('fictional-invoice', 'sslcommerz');
  expect(gatewayAttemptKey('fictional-invoice', 'sslcommerz')).toBe(first);
  expect(gatewayAttemptKey('other-invoice', 'sslcommerz')).not.toBe(first);
  clearGatewayAttempt('fictional-invoice', 'sslcommerz');
  expect(gatewayAttemptKey('fictional-invoice', 'sslcommerz')).not.toBe(first);
});
it('keeps the in-memory identity when session storage is unavailable', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Unavailable');
  });
  try {
    const first = gatewayAttemptKey('fictional', 'sslcommerz');
    expect(gatewayAttemptKey('fictional', 'sslcommerz', first)).toBe(first);
  } finally {
    get.mockRestore();
  }
});
