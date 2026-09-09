import type { Request } from 'express';

/**
 * The three web surfaces, each its own session namespace (cookie names
 * `teka_{surface}_*`). All three share the `.teka.cd` cookie domain (the API on
 * api.teka.cd has to receive them — narrowing that is D2b), so a browser that is
 * signed in on several surfaces sends ALL their cookies to the API on every
 * request. Which one authenticates a request is therefore a security decision,
 * and since D2a (2026-09-06) it is made from two TRUSTED inputs only:
 *
 *  1. the request `Origin` — matched exactly against the configured web URLs
 *     (`ADMIN_WEB_URL`, `SELLER_WEB_URL`, the remaining `CORS_ORIGINS` for the
 *     public buyer site) — selects the cookie namespace that may be read;
 *  2. the account's stored role — fixes the namespace its session is written
 *     to (`surfaceForRole`) and must agree with the namespace it was read from.
 *
 * The client header `X-Teka-Surface` used to select the namespace; it is now
 * untrusted telemetry only (see `headerSurfaceHint`). Bearer requests (mobile)
 * carry no cookie and no Origin: they never enter the cookie path at all.
 */
export type AuthSurface = 'admin' | 'seller' | 'buyer';

export const SURFACES: readonly AuthSurface[] = ['admin', 'seller', 'buyer'];

/** Roles that may hold a session in each web surface's cookie namespace. */
const ROLES_BY_SURFACE: Record<AuthSurface, readonly string[]> = {
  admin: ['ADMIN', 'SUPPORT', 'FINANCE'],
  seller: ['SELLER'],
  buyer: ['BUYER'],
};

/**
 * The only namespace a session for `role` may live in. Pure function of the
 * trusted role — no request input. Unknown roles get no surface (null), which
 * every caller treats as "cookie authentication impossible".
 */
export function surfaceForRole(role: string | null | undefined): AuthSurface | null {
  if (!role) return null;
  for (const surface of SURFACES) {
    if (ROLES_BY_SURFACE[surface].includes(role)) return surface;
  }
  return null;
}

/** Per-surface cookie names. */
export function cookieNamesFor(surface: AuthSurface) {
  return {
    access: `teka_${surface}_access_token`,
    refresh: `teka_${surface}_refresh_token`,
    session: `teka_${surface}_session`,
  } as const;
}

export type SurfaceOriginMap = ReadonlyMap<string, AuthSurface>;

function normalizeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    // `URL.origin` is scheme + host + non-default port, lower-cased host, no
    // path/credentials — the exact form browsers put in the Origin header.
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Exact-match table origin → surface, built from configuration only:
 * `ADMIN_WEB_URL` → admin, `SELLER_WEB_URL` → seller, and every remaining
 * `CORS_ORIGINS` entry (the public site, its `www.` twin, the dev ports) →
 * buyer. `BUYER_WEB_URL` is added to the buyer set as well. Nothing is derived
 * by prefix, suffix or substring, so `https://admin.teka.cd.attacker.example`
 * or `https://teka.cd.attacker.example` can never match.
 */
export function buildSurfaceOriginMap(config: {
  adminWebUrl?: string;
  sellerWebUrl?: string;
  buyerWebUrl?: string;
  corsOrigins?: string;
}): SurfaceOriginMap {
  const map = new Map<string, AuthSurface>();
  const admin = normalizeOrigin(config.adminWebUrl);
  const seller = normalizeOrigin(config.sellerWebUrl);
  const buyer = normalizeOrigin(config.buyerWebUrl);
  if (admin) map.set(admin, 'admin');
  if (seller && !map.has(seller)) map.set(seller, 'seller');
  if (buyer && !map.has(buyer)) map.set(buyer, 'buyer');
  for (const raw of (config.corsOrigins ?? '').split(',')) {
    const origin = normalizeOrigin(raw);
    if (origin && !map.has(origin)) map.set(origin, 'buyer');
  }
  return map;
}

/** The surface a browser request comes from, or null when it cannot be trusted. */
export function surfaceFromOrigin(
  map: SurfaceOriginMap,
  originHeader: string | string[] | undefined,
): AuthSurface | null {
  const raw = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  const origin = normalizeOrigin(raw);
  if (!origin) return null;
  return map.get(origin) ?? null;
}

/**
 * Untrusted hint: what the client CLAIMS its surface is. Never used for any
 * security decision — only to log a mismatch against the trusted origin, which
 * is a strong signal of a forged request.
 */
export function headerSurfaceHint(req: Request): AuthSurface | null {
  const raw = req.headers['x-teka-surface'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && (SURFACES as readonly string[]).includes(value)
    ? (value as AuthSurface)
    : null;
}

/** Set on the request by the JWT strategy when a cookie authenticated it. */
export interface TekaAuthContext {
  via: 'cookie' | 'bearer';
  /** The namespace the cookie was read from (cookie auth only). */
  surface: AuthSurface | null;
}

export type RequestWithAuthContext = Request & { tekaAuth?: TekaAuthContext };
