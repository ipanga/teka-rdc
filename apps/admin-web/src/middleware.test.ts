import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from './middleware';

function req(path: string, cookie?: string) {
  return new NextRequest(`https://admin.teka.cd${path}`, { headers: cookie ? { cookie } : {} });
}

describe('admin-web middleware (D4 headers + existing gate)', () => {
  it('every HTML response carries a nonce CSP, noindex and private no-store', () => {
    const res = middleware(req('/login'));
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('the nonce is handed to the renderer through the request headers and differs per request', () => {
    const a = middleware(req('/login'));
    const b = middleware(req('/login'));
    const nonceA = a.headers.get('x-middleware-request-x-nonce');
    const nonceB = b.headers.get('x-middleware-request-x-nonce');
    expect(nonceA).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(nonceA).not.toBe(nonceB);
    expect(a.headers.get('content-security-policy')).toContain(`'nonce-${nonceA}'`);
    expect(a.headers.get('x-middleware-request-content-security-policy')).toBe(
      a.headers.get('content-security-policy'),
    );
  });

  it('an unauthenticated dashboard hit redirects to /login and the redirect is itself protected', () => {
    const res = middleware(req('/dashboard/payouts'));
    expect(res.headers.get('location')).toContain('/login');
    expect(res.headers.get('location')).toContain('redirect=');
    expect(res.headers.get('content-security-policy')).toContain("'strict-dynamic'");
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('a dashboard hit with a session passes through (no redirect) and stays no-store', () => {
    const res = middleware(req('/dashboard', 'teka_admin_refresh_token=live'));
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  // P1: the printable « Bon de livraison » lives outside /dashboard (no admin
  // chrome on paper) but is just as protected.
  it('the printable document route needs a session and is noindex + private no-store', () => {
    const anon = middleware(req('/documents/bon-de-livraison/70000000-0000-4000-8000-000000000042'));
    expect(anon.headers.get('location')).toContain('/login');
    expect(anon.headers.get('location')).toContain('redirect=%2Fdocuments%2Fbon-de-livraison');
    expect(anon.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(anon.headers.get('cache-control')).toBe('private, no-store');

    const authed = middleware(req('/documents/bon-de-livraison/x', 'teka_admin_access_token=live'));
    expect(authed.headers.get('location')).toBeNull();
    expect(authed.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(authed.headers.get('cache-control')).toBe('private, no-store');
  });

  it('a look-alike path is not treated as the protected prefix', () => {
    const res = middleware(req('/documentsX'));
    expect(res.headers.get('location')).toBeNull();
  });
});
