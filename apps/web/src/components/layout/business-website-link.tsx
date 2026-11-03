'use client';

import { usePublicPreferences } from '../../lib/public-preferences';

export function BusinessWebsiteLink({ fallback }: { fallback?: string }) {
  const website = usePublicPreferences().website ?? fallback;
  return website ? (
    <a className="footer-link break-all" href={website}>
      Business website
    </a>
  ) : null;
}
