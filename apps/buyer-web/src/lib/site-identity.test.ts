import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ORGANIZATION_JSON_LD, WEBSITE_JSON_LD, SITE_LOGO_URL } from './site-identity';

describe('site identity JSON-LD', () => {
  it('Organization.logo points at a file that really exists under public/', () => {
    const publicPath = path.join(__dirname, '..', '..', 'public', new URL(SITE_LOGO_URL).pathname);
    expect(existsSync(publicPath)).toBe(true);
    expect(ORGANIZATION_JSON_LD.logo).toBe('https://teka.cd/logo.svg');
  });

  it('uses the canonical identity and links WebSite to the Organization', () => {
    expect(ORGANIZATION_JSON_LD.name).toBe('Teka RDC');
    expect(ORGANIZATION_JSON_LD.url).toBe('https://teka.cd');
    expect(WEBSITE_JSON_LD.publisher).toEqual({ '@id': 'https://teka.cd/#organization' });
    expect(ORGANIZATION_JSON_LD['@id']).toBe('https://teka.cd/#organization');
  });

  it('WebSite carries a sitelinks SearchAction pointing at the real search route', () => {
    const action = WEBSITE_JSON_LD.potentialAction as { target: { urlTemplate: string }; 'query-input': string };
    expect(action.target.urlTemplate).toBe('https://teka.cd/recherche?q={search_term_string}');
    expect(action['query-input']).toBe('required name=search_term_string');
  });

  it('does not advertise any town in static identity copy (towns are data-driven, Likasi inactive)', () => {
    const text = JSON.stringify(ORGANIZATION_JSON_LD) + JSON.stringify(WEBSITE_JSON_LD);
    expect(text).not.toMatch(/Likasi|Lubumbashi|Kolwezi/);
  });
});
