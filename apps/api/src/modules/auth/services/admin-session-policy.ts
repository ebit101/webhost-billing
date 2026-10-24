import { ADMIN_SESSION_TTL_MILLISECONDS } from '../auth.constants';

export const REMEMBERED_ADMIN_SESSION_TTL_MILLISECONDS =
  30 * 24 * 60 * 60 * 1_000;
export const BROWSER_ADMIN_SESSION_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;

const BROWSER_PREFIX = 'admin-browser.';
const REMEMBERED_PREFIX = 'admin-remembered.';

// The entire token, including this policy marker, is hashed in auth_sessions.
// Read the policy only after authenticating that exact token against its row.
export function administratorSessionMode(token: string) {
  if (token.startsWith(BROWSER_PREFIX)) return 'browser';
  if (token.startsWith(REMEMBERED_PREFIX)) return 'remembered';
  return 'legacy';
}

export function administratorSessionToken(
  token: string,
  rememberDevice: boolean,
) {
  return `${rememberDevice ? REMEMBERED_PREFIX : BROWSER_PREFIX}${token}`;
}

export function administratorSessionTtl(token: string, configuredTtl: number) {
  switch (administratorSessionMode(token)) {
    case 'browser':
      return Math.min(configuredTtl, BROWSER_ADMIN_SESSION_TTL_MILLISECONDS);
    case 'remembered':
      return REMEMBERED_ADMIN_SESSION_TTL_MILLISECONDS;
    case 'legacy':
      return ADMIN_SESSION_TTL_MILLISECONDS;
  }
}
