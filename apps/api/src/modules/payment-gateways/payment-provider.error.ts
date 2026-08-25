export class PaymentProviderError extends Error {
  constructor(
    readonly safeMessage: string,
    readonly outcome: 'FAILED' | 'UNKNOWN' = 'FAILED',
  ) {
    super(safeMessage);
    this.name = 'PaymentProviderError';
  }
}
