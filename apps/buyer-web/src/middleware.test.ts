import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from './middleware';

function req(path: string, cookie?: string) {
  return new NextRequest(`https://teka.cd${path}`, {
    headers: cookie ? { cookie } : {},
  });
}
// A redirect response carries a Location header; next() does not.
const location = (res: ReturnType<typeof middleware>) => res.headers.get('location');

describe('middleware', () => {
  describe('auth-only routes are never bounced on cookie presence (stale-token fix)', () => {
    it('/connexion with a lingering access-token cookie is NOT redirected', () => {
      // The bug: a dead session whose cookie merely lingers used to bounce
      // /connexion → home, stranding the logged-out user (heart looked inert).
      const res = middleware(req('/connexion', 'teka_buyer_access_token=stale'));
      expect(location(res)).toBeNull();
    });

    it('/connexion with a lingering refresh-token cookie is NOT redirected', () => {
      const res = middleware(req('/connexion', 'teka_buyer_refresh_token=stale'));
      expect(location(res)).toBeNull();
    });

    it('/connexion?redirect=… with a session cookie is NOT redirected', () => {
      const res = middleware(
        req('/connexion?redirect=%2Flubumbashi', 'teka_buyer_access_token=stale'),
      );
      expect(location(res)).toBeNull();
    });

    it('/connexion for a true guest (no cookies) is NOT redirected', () => {
      const res = middleware(req('/connexion'));
      expect(location(res)).toBeNull();
    });

    it('/reclamer-compte with a session cookie is NOT redirected', () => {
      const res = middleware(req('/reclamer-compte', 'teka_buyer_refresh_token=stale'));
      expect(location(res)).toBeNull();
    });
  });

  describe('protected routes still gate on session presence', () => {
    it('/commandes without a session → redirect to /connexion?redirect=/commandes', () => {
      const res = middleware(req('/commandes'));
      const loc = location(res);
      expect(loc).toContain('/connexion');
      expect(loc).toContain('redirect=%2Fcommandes');
    });

    it('/favoris without a session → redirect to /connexion', () => {
      expect(location(middleware(req('/favoris')))).toContain('/connexion');
    });

    it('/paiement without a session → redirect to /connexion', () => {
      expect(location(middleware(req('/paiement')))).toContain('/connexion');
    });

    it('/commandes WITH a session cookie is allowed through (not redirected)', () => {
      // A stale cookie lets the user in; the page API 401s and it can now
      // reach /connexion to recover — benign, by design.
      const res = middleware(req('/commandes', 'teka_buyer_refresh_token=live'));
      expect(location(res)).toBeNull();
    });
  });

  describe('public routes pass through', () => {
    it('a city landing page is not touched', () => {
      expect(location(middleware(req('/lubumbashi')))).toBeNull();
    });
    it('a product page is not touched', () => {
      expect(location(middleware(req('/lubumbashi/iphone-15-a1b2c3')))).toBeNull();
    });
  });
});
