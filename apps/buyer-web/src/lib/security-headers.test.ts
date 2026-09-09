import { describe, it, expect } from 'vitest';
import {
  buildBuyerCsp,
  buyerSecurityHeaders,
  originOf,
  sentryOriginFromDsn,
  PERMISSIONS_POLICY,
} from './security-headers';

const prod = {
  apiUrl: 'https://api.teka.cd/api',
  sentryDsn: 'https://abc123@o4511.ingest.de.sentry.io/456',
  clarityProjectId: 'x1d3zjafwb',
};

function directive(csp: string, name: string): string[] {
  const d = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${name} `) || s === name);
  return d ? d.split(/\s+/).slice(1) : [];
}

describe('buyer security headers (D4)', () => {
  it('production CSP never allows eval and never falls back to a wildcard', () => {
    const csp = buildBuyerCsp(prod);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(csp).not.toContain('http:');
    expect(directive(csp, 'default-src')).toEqual(["'self'"]);
    expect(directive(csp, 'object-src')).toEqual(["'none'"]);
    expect(directive(csp, 'base-uri')).toEqual(["'self'"]);
    expect(directive(csp, 'form-action')).toEqual(["'self'"]);
    expect(csp).toContain('upgrade-insecure-requests');
  });

  it('is not frameable by anyone (CSP + legacy header agree)', () => {
    expect(directive(buildBuyerCsp(prod), 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(buildBuyerCsp(prod), 'frame-src')).toEqual(["'none'"]);
    const xfo = buyerSecurityHeaders(prod).find((h) => h.key === 'X-Frame-Options');
    expect(xfo?.value).toBe('DENY');
  });

  it("keeps 'unsafe-inline' for scripts (prerendered SEO pages cannot carry a nonce) — documented exception", () => {
    expect(directive(buildBuyerCsp(prod), 'script-src')).toContain("'unsafe-inline'");
  });

  it('connect-src lists exactly the API origin and the Sentry ingest origin derived from the DSN', () => {
    const c = directive(buildBuyerCsp(prod), 'connect-src');
    expect(c).toContain('https://api.teka.cd');
    expect(c).not.toContain('https://api.teka.cd/api');
    expect(c).toContain('https://o4511.ingest.de.sentry.io');
    expect(c).not.toContain('abc123');
    expect(c).not.toContain('ws:');
  });

  it('without a Sentry DSN or Clarity id no third-party host is granted', () => {
    const csp = buildBuyerCsp({ apiUrl: 'https://api.teka.cd/api' });
    expect(csp).not.toContain('sentry.io');
    expect(csp).not.toContain('clarity.ms');
    expect(directive(csp, 'script-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('Clarity hosts appear only when a project id is baked in, and only in script/connect', () => {
    const csp = buildBuyerCsp(prod);
    expect(directive(csp, 'script-src')).toEqual(
      expect.arrayContaining(['https://www.clarity.ms', 'https://scripts.clarity.ms']),
    );
    expect(directive(csp, 'connect-src')).toContain('https://*.clarity.ms');
    expect(directive(csp, 'img-src')).not.toContain('https://*.clarity.ms');
  });

  it('images: self, data/blob previews and Cloudinary only; fonts self-hosted', () => {
    const csp = buildBuyerCsp(prod);
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://res.cloudinary.com']);
    expect(directive(csp, 'font-src')).toEqual(["'self'", 'data:']);
    expect(csp).not.toContain('fonts.googleapis.com');
    expect(csp).not.toContain('accounts.google.com');
  });

  it('dev mode adds eval, the HMR websocket and the placeholder image host — nothing else', () => {
    const dev = buildBuyerCsp({ ...prod, dev: true });
    expect(directive(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev, 'connect-src')).toEqual(expect.arrayContaining(['ws:', 'wss:']));
    expect(directive(dev, 'img-src')).toContain('https://picsum.photos');
    expect(dev).not.toContain('upgrade-insecure-requests');
  });

  it('emits the full header set with the expected fixed values', () => {
    const h = Object.fromEntries(buyerSecurityHeaders(prod).map((x) => [x.key, x.value]));
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(h['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(h['Permissions-Policy']).toBe(PERMISSIONS_POLICY);
    expect(h['Cross-Origin-Embedder-Policy']).toBeUndefined();
    expect(h['Strict-Transport-Security']).toBeUndefined(); // nginx owns HSTS
  });

  it('Permissions-Policy denies every hardware/payment capability the storefront never uses', () => {
    for (const f of ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'bluetooth', 'accelerometer', 'gyroscope', 'magnetometer', 'display-capture']) {
      expect(PERMISSIONS_POLICY).toContain(`${f}=()`);
    }
    expect(PERMISSIONS_POLICY).toContain('fullscreen=(self)');
  });

  it('originOf / sentryOriginFromDsn reject non-http values instead of granting them', () => {
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('not a url')).toBeNull();
    expect(originOf('')).toBeNull();
    expect(originOf('http://localhost:5051/api')).toBe('http://localhost:5051');
    expect(sentryOriginFromDsn(undefined)).toBeNull();
  });
});
