const prefix = 'webhost-checkout:';
export function gatewayAttemptKey(
  invoiceId: string,
  provider: string,
  previous?: string,
): string {
  const name = `${prefix}${provider}:${invoiceId}`;
  try {
    const saved = window.sessionStorage.getItem(name);
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) return saved;
    const next = previous ?? crypto.randomUUID();
    window.sessionStorage.setItem(name, next);
    return next;
  } catch {
    return previous ?? crypto.randomUUID();
  }
}
export function clearGatewayAttempt(invoiceId: string, provider: string) {
  try {
    window.sessionStorage.removeItem(`${prefix}${provider}:${invoiceId}`);
  } catch {
    /* Server-side attempt holds remain authoritative. */
  }
}
