import type { Request } from 'express';

/**
 * The three web surfaces, each its own session namespace. All three share the
 * `.teka.cd` cookie domain (required so the API on api.teka.cd actually
 * receives the cookie), so cookie *names* are what keep buyer/seller/admin
 * sessions isolated in a single browser — logging out (or expiring) on one
 * surface must not touch the others.
 */
export type AuthSurface = 'admin' | 'seller' | 'buyer';

const SURFACES: readonly AuthSurface[] = ['admin', 'seller', 'buyer'];

// Fallback when no surface header is present (e.g. a curl/server call holding
// a cookie). Bearer/mobile requests carry no cookies and never reach the
// cookie extractor, so the default is harmless for them. Buyer is the
// least-privileged public surface.
const DEFAULT_SURFACE: AuthSurface = 'buyer';

/**
 * Which web surface a request came from. Each web app's api-client sends an
 * `X-Teka-Surface` header; this drives which per-surface cookie set is
 * read / written / cleared.
 */
export function resolveSurface(req: Request): AuthSurface {
  const raw = req.headers['x-teka-surface'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && (SURFACES as readonly string[]).includes(value)) {
    return value as AuthSurface;
  }
  return DEFAULT_SURFACE;
}

/** Per-surface cookie names. */
export function cookieNamesFor(surface: AuthSurface) {
  return {
    access: `teka_${surface}_access_token`,
    refresh: `teka_${surface}_refresh_token`,
    session: `teka_${surface}_session`,
  } as const;
}
