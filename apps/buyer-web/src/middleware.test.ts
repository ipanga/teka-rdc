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

  describe('cache policy (D4)', () => {
    it('a signed-in account page is marked private, no-store', () => {
      const res = middleware(req('/commandes', 'teka_buyer_access_token=live'));
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    });
    it('public SEO pages carry no cache override (ISR/edge caching untouched)', () => {
      expect(middleware(req('/lubumbashi')).headers.get('cache-control')).toBeNull();
      expect(middleware(req('/')).headers.get('cache-control')).toBeNull();
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

  describe('upper-case paths → lower-case canonical (SEO-2)', () => {
  it('308s /Lubumbashi and a mixed-case category path to their lower-case canonical', () => {
    const r1 = middleware(req('/Lubumbashi'));
    expect(r1.status).toBe(308);
    expect(r1.headers.get('location')).toBe('https://teka.cd/lubumbashi');
    const r2 = middleware(req('/Lubumbashi/Categorie/Smartphones/'));
    expect(r2.status).toBe(308);
    expect(r2.headers.get('location')).toBe('https://teka.cd/lubumbashi/categorie/smartphones');
  });

  it('leaves the query string alone (search terms keep their case) and never touches /ingest', () => {
    const r = middleware(req('/Recherche?q=Samsung%20A15'));
    expect(r.status).toBe(308);
    expect(r.headers.get('location')).toBe('https://teka.cd/recherche?q=Samsung%20A15');
    const ingest = middleware(req('/ingest/Static/x'));
    expect(ingest.status).not.toBe(308);
  });
});

describe('trailing slash → canonical (SEO-1)', () => {
    it('308s a slashed page URL to its slash-less canonical, keeping the query', () => {
      const res = middleware(req('/lubumbashi/categorie/telephones/?tri=prix'));
      expect(res.status).toBe(308);
      expect(res.headers.get('location')).toBe('https://teka.cd/lubumbashi/categorie/telephones?tri=prix');
    });

    it('collapses repeated trailing slashes and never redirects the root', () => {
      expect(middleware(req('/kolwezi//')).headers.get('location')).toBe('https://teka.cd/kolwezi');
      expect(middleware(req('/')).status).toBe(200);
    });

    it('leaves the PostHog proxy alone (the reason skipTrailingSlashRedirect exists)', () => {
      const res = middleware(req('/ingest/'));
      expect(res.status).not.toBe(308);
    });

    it('a slash-less product page is not touched', () => {
      expect(middleware(req('/lubumbashi/iphone-15-a1b2c3')).status).toBe(200);
    });
  });
});
