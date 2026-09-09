/**
 * Browser security headers for the seller portal (D4, 2026-09-06).
 *
 * Owned by the Next.js app, not nginx: the non-CSP headers come from
 * next.config.ts `headers()` (every response, static assets included) and
 * the CSP comes from middleware.ts because it carries a per-request nonce.
 * nginx keeps only transport-level HSTS.
 *
 * script-src is `'nonce-…' 'strict-dynamic'`: only scripts Next.js stamps
 * with the request nonce run, and the chunks they load are trusted
 * transitively. No `'unsafe-inline'`, no `'unsafe-eval'` in production
 * (`next dev` needs eval for its source maps and a websocket for HMR — both
 * are added only when `dev` is true). A nonce requires every page to render
 * per request, which this authenticated, non-indexed portal already does
 * (the root layout reads the request headers to make that explicit).
 *
 * Third-party origins are the ones the browser actually contacts: the API,
 * Cloudinary images,
 * and the Sentry ingest origin derived from the public DSN. PostHog is proxied
 * through `/ingest` (same origin); no Clarity on this surface.
 */
export interface PortalSecurityOptions {
  /** `NEXT_PUBLIC_API_URL` (any path is ignored — only the origin matters). */
  apiUrl?: string;
  /** `NEXT_PUBLIC_SENTRY_DSN_SELLER_WEB`; empty ⇒ no Sentry origin allowed. */
  sentryDsn?: string;
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

export const CLOUDINARY_IMG_HOSTS = ['https://res.cloudinary.com'];

/** 128-bit random nonce, base64 (the format CSP expects). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function buildPortalCsp(nonce: string, opts: PortalSecurityOptions = {}): string {
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(nonce)) {
    throw new Error('CSP nonce must be base64 and at least 16 characters');
  }
  const dev = opts.dev === true;
  const api = originOf(opts.apiUrl);
  const sentry = originOf(opts.sentryDsn);

  const scriptSrc = [`'nonce-${nonce}'`, "'strict-dynamic'", "'self'"];
  if (dev) scriptSrc.push("'unsafe-eval'");

  const connectSrc = ["'self'"];
  if (api) connectSrc.push(api);
  if (sentry) connectSrc.push(sentry);
  if (dev) connectSrc.push('ws:', 'wss:');

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    // React `style` props are style attributes, which have no nonce.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${CLOUDINARY_IMG_HOSTS.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(' ')}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
  ];
  if (!dev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Browser capabilities this portal never uses (file inputs are unaffected). */
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

/** Non-CSP headers applied to every response (HTML and static assets). */
export function portalSecurityHeaders(): HeaderPair[] {
  return [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    // Referrer only for our own origin: signed document URLs and internal
    // paths never reach Cloudinary or anyone else via the Referer header.
    { key: 'Referrer-Policy', value: 'same-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    // No Cross-Origin-Embedder-Policy: Cloudinary images carry no CORP header.
  ];
}
