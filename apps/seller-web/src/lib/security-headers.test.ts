import { describe, it, expect } from 'vitest';
import {
  buildPortalCsp,
  generateNonce,
  portalSecurityHeaders,
  originOf,
  PERMISSIONS_POLICY,
} from './security-headers';

const prod = {
  apiUrl: 'https://api.teka.cd/api',
  sentryDsn: 'https://abc123@o4511.ingest.de.sentry.io/456',
};

function directive(csp: string, name: string): string[] {
  const d = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `) || s === name);
  return d ? d.split(/\s+/).slice(1) : [];
}

describe('seller-web security headers (D4)', () => {
  const nonce = generateNonce();

  it('generates a fresh 128-bit base64 nonce per call', () => {
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(generateNonce()).not.toBe(nonce);
  });

  it("production script-src is nonce + strict-dynamic — no 'unsafe-inline', no 'unsafe-eval'", () => {
    const s = directive(buildPortalCsp(nonce, prod), 'script-src');
    expect(s).toContain(`'nonce-${nonce}'`);
    expect(s).toContain("'strict-dynamic'");
    expect(s).not.toContain("'unsafe-inline'");
    expect(s).not.toContain("'unsafe-eval'");
  });

  it('refuses a weak or malformed nonce instead of emitting a bypassable policy', () => {
    expect(() => buildPortalCsp('short', prod)).toThrow();
    expect(() => buildPortalCsp("abc'; script-src *", prod)).toThrow();
  });

  it('is not frameable and never falls back to a wildcard or http:', () => {
    const csp = buildPortalCsp(nonce, prod);
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(csp, 'frame-src')).toEqual(["'none'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toContain('http:');
    expect(csp).toContain('upgrade-insecure-requests');
    expect(portalSecurityHeaders().find((h) => h.key === 'X-Frame-Options')?.value).toBe('DENY');
  });

  it('connect-src is exactly self + API origin + Sentry ingest origin (no key, no path)', () => {
    const c = directive(buildPortalCsp(nonce, prod), 'connect-src');
    expect(c).toEqual(["'self'", 'https://api.teka.cd', 'https://o4511.ingest.de.sentry.io']);
  });

  it('no Clarity, no Google, no PostHog host (PostHog is proxied same-origin)', () => {
    const csp = buildPortalCsp(nonce, prod);
    expect(csp).not.toContain('clarity.ms');
    expect(csp).not.toContain('google');
    expect(csp).not.toContain('posthog.com');
  });

  it('images: self, previews and Cloudinary delivery only — the private-download API host is admin-only', () => {
    const i = directive(buildPortalCsp(nonce, prod), 'img-src');
    expect(i).toEqual(["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']);
  });

  it('dev mode adds eval + HMR websocket only', () => {
    const dev = buildPortalCsp(nonce, { ...prod, dev: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:']));
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('non-CSP headers: nosniff, same-origin referrer, COOP/CORP, hardware denied, no HSTS (nginx owns it)', () => {
    const h = Object.fromEntries(portalSecurityHeaders().map((x) => [x.key, x.value]));
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('same-origin');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(h['Permissions-Policy']).toBe(PERMISSIONS_POLICY);
    for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb']) expect(PERMISSIONS_POLICY).toContain(`${f}=()`);
    expect(h['Strict-Transport-Security']).toBeUndefined();
    expect(h['Cross-Origin-Embedder-Policy']).toBeUndefined();
  });

  it('originOf rejects non-http values', () => {
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('nope')).toBeNull();
    expect(originOf('http://localhost:5051/api')).toBe('http://localhost:5051');
  });
});
