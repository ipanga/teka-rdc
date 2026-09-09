import {
  buildSurfaceOriginMap,
  cookieNamesFor,
  headerSurfaceHint,
  surfaceForRole,
  surfaceFromOrigin,
} from './surface.util';

describe('surface.util (D2a)', () => {
  const prod = buildSurfaceOriginMap({
    adminWebUrl: 'https://admin.teka.cd',
    sellerWebUrl: 'https://seller.teka.cd',
    buyerWebUrl: 'https://teka.cd',
    corsOrigins: 'https://teka.cd,https://www.teka.cd,https://seller.teka.cd,https://admin.teka.cd',
  });

  describe('surfaceForRole — the only namespace a session may live in', () => {
    it.each([
      ['BUYER', 'buyer'],
      ['SELLER', 'seller'],
      ['ADMIN', 'admin'],
      ['SUPPORT', 'admin'],
      ['FINANCE', 'admin'],
    ])('%s → %s', (role, surface) => {
      expect(surfaceForRole(role)).toBe(surface);
    });
    it('unknown / missing roles get no surface', () => {
      expect(surfaceForRole('DRIVER')).toBeNull();
      expect(surfaceForRole(undefined)).toBeNull();
      expect(surfaceForRole('')).toBeNull();
    });
  });

  describe('surfaceFromOrigin — exact match against configuration only', () => {
    it.each([
      ['https://admin.teka.cd', 'admin'],
      ['https://seller.teka.cd', 'seller'],
      ['https://teka.cd', 'buyer'],
      ['https://www.teka.cd', 'buyer'],
      ['https://ADMIN.teka.cd', 'admin'],
      ['https://admin.teka.cd/', 'admin'],
    ])('%s → %s', (origin, surface) => {
      expect(surfaceFromOrigin(prod, origin)).toBe(surface);
    });

    it.each([
      'https://teka.cd.attacker.example',
      'https://admin.teka.cd.attacker.example',
      'https://attacker.example/admin.teka.cd',
      'https://evil.example',
      'http://admin.teka.cd',
      'https://admin.teka.cd:8443',
      'https://xadmin.teka.cd',
      'null',
      'javascript:alert(1)',
      '',
      undefined,
    ])('refuses %s', (origin) => {
      expect(surfaceFromOrigin(prod, origin as string | undefined)).toBeNull();
    });

    it('takes only the first value of a multi-valued header', () => {
      expect(surfaceFromOrigin(prod, ['https://evil.example', 'https://admin.teka.cd'])).toBeNull();
      expect(surfaceFromOrigin(prod, ['https://admin.teka.cd', 'https://evil.example'])).toBe('admin');
    });

    it('classifies development origins: admin/seller ports by URL, every other CORS origin as buyer', () => {
      const dev = buildSurfaceOriginMap({
        adminWebUrl: 'http://localhost:5200',
        sellerWebUrl: 'http://localhost:5100',
        buyerWebUrl: 'http://localhost:5001',
        corsOrigins: 'http://localhost:5000,http://localhost:5001,http://localhost:5100,http://localhost:5200,http://localhost:8080',
      });
      expect(surfaceFromOrigin(dev, 'http://localhost:5200')).toBe('admin');
      expect(surfaceFromOrigin(dev, 'http://localhost:5100')).toBe('seller');
      expect(surfaceFromOrigin(dev, 'http://localhost:5001')).toBe('buyer');
      expect(surfaceFromOrigin(dev, 'http://localhost:5000')).toBe('buyer');
      expect(surfaceFromOrigin(dev, 'http://localhost:8080')).toBe('buyer');
      expect(surfaceFromOrigin(dev, 'http://localhost:5300')).toBeNull();
      expect(surfaceFromOrigin(dev, 'https://admin.teka.cd')).toBeNull();
    });

    it('never lets a CORS entry override the admin/seller classification', () => {
      const map = buildSurfaceOriginMap({
        adminWebUrl: 'https://admin.teka.cd',
        sellerWebUrl: 'https://seller.teka.cd',
        corsOrigins: 'https://admin.teka.cd,https://seller.teka.cd',
      });
      expect(surfaceFromOrigin(map, 'https://admin.teka.cd')).toBe('admin');
      expect(surfaceFromOrigin(map, 'https://seller.teka.cd')).toBe('seller');
    });
  });

  it('headerSurfaceHint only ever yields a known value and is never required', () => {
    const req = (v?: string | string[]) => ({ headers: { 'x-teka-surface': v } }) as never;
    expect(headerSurfaceHint(req('admin'))).toBe('admin');
    expect(headerSurfaceHint(req('ADMIN'))).toBeNull();
    expect(headerSurfaceHint(req('../admin'))).toBeNull();
    expect(headerSurfaceHint(req(undefined))).toBeNull();
  });

  it('cookieNamesFor keeps the established names', () => {
    expect(cookieNamesFor('admin')).toEqual({
      access: 'teka_admin_access_token',
      refresh: 'teka_admin_refresh_token',
      session: 'teka_admin_session',
    });
  });
});
