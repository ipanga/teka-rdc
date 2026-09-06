/**
 * Browser security headers for the buyer storefront (D4, 2026-09-06).
 *
 * Owned by the Next.js app (next.config.ts `headers()`), not nginx, so every
 * environment — `next dev`, `next start`, Docker — serves the same policy and
 * a test can assert it. nginx keeps only transport-level HSTS.
 *
 * Why the CSP is static and keeps `'unsafe-inline'` for scripts: the
 * storefront is the SEO surface and its pages are prerendered / ISR-cached;
 * a per-request nonce would force every page to render dynamically. The
 * inline scripts are Next.js's own hydration payloads plus our service-worker
 * registration and the Clarity tag; no `eval` is needed in production, so
 * `'unsafe-eval'` is gone (it is added back only under `next dev`, whose
 * source maps use it). Seller and admin, which have no SEO constraint, use a
 * nonce + `'strict-dynamic'` instead.
 *
 * Every third-party origin below is one the browser actually contacts today:
 * the API, Cloudinary images, the Sentry ingest host derived from the public
 * DSN, and Microsoft Clarity when a project id is baked in. PostHog is proxied
 * through `/ingest` (same origin). Fonts are self-hosted by next/font.
 */
export interface BuyerSecurityOptions {
  /** `NEXT_PUBLIC_API_URL` (any path is ignored — only the origin matters). */
  apiUrl?: string;
  /** `NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB`; empty ⇒ no Sentry origin allowed. */
  sentryDsn?: string;
  /** `NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB`; empty ⇒ Clarity hosts absent. */
  clarityProjectId?: string;
  /** `next dev` needs eval (source maps) and the HMR websocket. */
  dev?: boolean;
}

/** Origin of a URL, or null when it is not an absolute http(s) URL. */
export function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Sentry ingest origin from a DSN (`https://<key>@<host>/<project>`). */
export function sentryOriginFromDsn(dsn: string | undefined | null): string | null {
  const origin = originOf(dsn);
  return origin;
}

export const CLARITY_SCRIPT_HOSTS = ['https://www.clarity.ms', 'https://scripts.clarity.ms'];
export const CLARITY_CONNECT_HOSTS = ['https://*.clarity.ms'];
export const CLOUDINARY_IMG_HOST = 'https://res.cloudinary.com';

export function buildBuyerCsp(opts: BuyerSecurityOptions = {}): string {
  const dev = opts.dev === true;
  const api = originOf(opts.apiUrl);
  const sentry = sentryOriginFromDsn(opts.sentryDsn);
  const clarity = Boolean(opts.clarityProjectId);

  const scriptSrc = ["'self'", "'unsafe-inline'"];
  if (dev) scriptSrc.push("'unsafe-eval'");
  if (clarity) scriptSrc.push(...CLARITY_SCRIPT_HOSTS);

  const connectSrc = ["'self'"];
  if (api) connectSrc.push(api);
  if (sentry) connectSrc.push(sentry);
  if (clarity) connectSrc.push(...CLARITY_CONNECT_HOSTS);
  if (dev) connectSrc.push('ws:', 'wss:');

  const imgSrc = ["'self'", 'data:', 'blob:', CLOUDINARY_IMG_HOST];
  if (dev) imgSrc.push('https://picsum.photos');

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // React `style` props and next/image's inline sizing are style attributes,
    // which `style-src` governs; there is no nonce for attributes.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' https://res.cloudinary.com",
    "frame-src 'none'",
  ];
  if (!dev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/**
 * Browser capabilities the storefront never uses. File inputs (product
 * photos on the seller side) are not governed by these features — only
 * getUserMedia-style APIs are.
 */
export const PERMISSIONS_POLICY = [
  'accelerometer=()',
  'bluetooth=()',
  'camera=()',
  'display-capture=()',
  'geolocation=()',
  'gyroscope=()',
  'magnetometer=()',
  'microphone=()',
  'payment=()',
  'usb=()',
  'fullscreen=(self)',
].join(', ');

export interface HeaderPair {
  key: string;
  value: string;
}

/** Headers applied to every buyer response (HTML and static assets). */
export function buyerSecurityHeaders(opts: BuyerSecurityOptions = {}): HeaderPair[] {
  return [
    { key: 'Content-Security-Policy', value: buildBuyerCsp(opts) },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Full URL to our own pages, origin only to third parties (outbound
    // social links, Cloudinary), nothing on a downgrade — keeps SEO referrals
    // intact without leaking paths or query strings off-site.
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    // Deliberately no Cross-Origin-Embedder-Policy: Cloudinary images carry no
    // CORP header and would be blocked under `require-corp`.
  ];
}
