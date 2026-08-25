import type { HostingPanelErrorKind } from '@webhost-billing/shared';

export class HostingPanelProviderError extends Error {
  constructor(
    readonly kind: HostingPanelErrorKind,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HostingPanelProviderError';
  }
}

export function normalizeHostingPanelError(
  error: unknown,
  mutationMayHaveSucceeded: boolean,
): HostingPanelProviderError {
  if (error instanceof HostingPanelProviderError) return error;
  if (mutationMayHaveSucceeded) {
    return new HostingPanelProviderError(
      'INCONSISTENT',
      'PANEL_RESULT_UNKNOWN',
      'The hosting panel result is unknown. Check the account before retrying.',
    );
  }
  return new HostingPanelProviderError(
    'TEMPORARY',
    'PANEL_TEMPORARILY_UNAVAILABLE',
    'The hosting panel is temporarily unavailable.',
  );
}

export async function withHostingPanelTimeout<T>(
  task: Promise<T>,
  timeoutMilliseconds: number,
  mutationMayHaveSucceeded: boolean,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new HostingPanelProviderError(
              mutationMayHaveSucceeded ? 'INCONSISTENT' : 'TEMPORARY',
              'PANEL_TIMEOUT',
              mutationMayHaveSucceeded
                ? 'The hosting panel timed out after accepting a mutation. Reconcile the account before retrying.'
                : 'The hosting panel timed out before returning a result.',
            ),
          );
        }, timeoutMilliseconds);
      }),
    ]);
  } catch (error) {
    throw normalizeHostingPanelError(error, mutationMayHaveSucceeded);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
