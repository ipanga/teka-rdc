/**
 * Where to land after a login that interrupted a deep link (middleware sends
 * unauthenticated dashboard visits to `/login?redirect=<path?query>`).
 * Only internal dashboard paths are honoured; absolute URLs, protocol-relative
 * `//host`, auth pages and garbage fall back to the dashboard, so a crafted
 * link can never bounce a freshly signed-in seller elsewhere. Mirrors
 * seller-mobile `PostLoginTarget`.
 */
export const DEFAULT_POST_LOGIN = '/dashboard';

export function resolvePostLoginRedirect(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_POST_LOGIN;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return DEFAULT_POST_LOGIN;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return DEFAULT_POST_LOGIN;
  if (decoded.includes('://') || decoded.includes('\\')) return DEFAULT_POST_LOGIN;
  const path = decoded.split('?')[0];
  if (!path.startsWith('/dashboard')) return DEFAULT_POST_LOGIN;
  return decoded;
}

/** `?redirect=` value from the current location, if any. */
export function redirectParamFrom(search: string): string | null {
  return new URLSearchParams(search.startsWith('?') ? search : `?${search}`).get('redirect');
}
