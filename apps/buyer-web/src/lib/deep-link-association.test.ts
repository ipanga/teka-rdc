import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Guards the two deep-link association files served from `public/.well-known/`.
 *
 * Why this test exists: `assetlinks.json` shipped to production carrying the
 * literal placeholder `REPLACE_WITH_PLAY_APP_SIGNING_SHA256_FINGERPRINT` for
 * weeks. Android silently fails App Links verification against an unparseable
 * fingerprint, so every `https://teka.cd/...` link opened the website instead
 * of buyer-mobile — with no error anywhere to notice. iOS was unaffected
 * (Universal Links match on team+bundle id, no cert fingerprint), which is why
 * the breakage looked Android-specific.
 *
 * These files are static assets, not code, so nothing else would catch a
 * regression. Keep this test cheap and assertion-only.
 */

const wellKnown = path.resolve(__dirname, '../../public/.well-known');

/** Google Digital Asset Links: 32 uppercase hex bytes joined by colons. */
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

describe('.well-known/assetlinks.json (Android App Links)', () => {
  const raw = fs.readFileSync(path.join(wellKnown, 'assetlinks.json'), 'utf8');

  it('is valid JSON containing at least one statement', () => {
    const parsed = JSON.parse(raw);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
  });

  it('declares the buyer-mobile package with handle_all_urls', () => {
    const [statement] = JSON.parse(raw);
    expect(statement.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(statement.target.namespace).toBe('android_app');
    expect(statement.target.package_name).toBe('com.tootiye.teka');
  });

  it('carries no placeholder fingerprint', () => {
    // The exact failure that shipped. Match loosely so any REPLACE_* /
    // TODO / XXX marker trips it, not just the original string.
    expect(raw).not.toMatch(/REPLACE|TODO|FIXME|XXX|PLACEHOLDER/i);
  });

  it('every fingerprint is a well-formed uppercase colon-separated SHA-256', () => {
    const [statement] = JSON.parse(raw);
    const fingerprints: string[] = statement.target.sha256_cert_fingerprints;

    expect(Array.isArray(fingerprints)).toBe(true);
    expect(fingerprints.length).toBeGreaterThan(0);

    for (const fp of fingerprints) {
      expect(fp, `malformed fingerprint: ${fp}`).toMatch(SHA256_FINGERPRINT);
    }
  });

  it('has no duplicate fingerprints', () => {
    const [statement] = JSON.parse(raw);
    const fingerprints: string[] = statement.target.sha256_cert_fingerprints;
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });
});

describe('.well-known/apple-app-site-association (iOS Universal Links)', () => {
  const raw = fs.readFileSync(path.join(wellKnown, 'apple-app-site-association'), 'utf8');
  const aasa = JSON.parse(raw);
  const detail = aasa.applinks.details[0];
  const paths: string[] = detail.components.map((c: Record<string, string>) => c['/']);

  it('is valid JSON (Apple rejects a malformed or non-JSON body)', () => {
    expect(aasa.applinks).toBeTruthy();
    expect(Array.isArray(aasa.applinks.details)).toBe(true);
  });

  it('declares the buyer-mobile app id under the shared Apple team', () => {
    expect(detail.appIDs).toContain('YK6Z393A4D.com.tootiye.teka');
  });

  it('excludes auth, account, and checkout paths from the app', () => {
    // These must stay in the browser: a Universal Link into them could land a
    // user on a protected screen or bypass the web auth flow. DeepLinkParser
    // enforces the same list app-side (_reservedFirstSegments) — keep in sync.
    for (const p of ['/connexion', '/paiement*', '/panier', '/profil', '/commandes*', '/favoris']) {
      const c = detail.components.find((x: Record<string, unknown>) => x['/'] === p);
      expect(c, `missing exclusion for ${p}`).toBeTruthy();
      expect(c.exclude, `${p} must be excluded`).toBe(true);
    }
  });

  it('keeps the catch-all last so the exclusions above it win', () => {
    // AASA components are evaluated in order; a catch-all placed before an
    // exclusion would swallow it and hand /paiement to the app.
    expect(paths[paths.length - 1]).toBe('/*');
  });
});
