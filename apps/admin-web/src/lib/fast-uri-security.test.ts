import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fast-uri is never imported by Teka code; it reaches all three web apps via
// @sentry/nextjs → @sentry/webpack-plugin → webpack → schema-utils → ajv.
// Walk that exact chain (pnpm-safe, no hoisting assumptions) so these tests
// exercise the copy Ajv actually uses, then pin the four advisory fixes.
const CHAIN = ['@sentry/nextjs', '@sentry/webpack-plugin', 'webpack', 'schema-utils', 'ajv', 'fast-uri'];
const appsDir = fileURLToPath(new URL('../../../', import.meta.url));

function packageRoot(entry: string, name: string): string {
  let dir = path.dirname(entry);
  while (!dir.endsWith(path.join('node_modules', name))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`${name}: package root not found from ${entry}`);
    dir = parent;
  }
  return dir;
}

function resolveChain(app: string): Record<string, string> {
  const roots: Record<string, string> = {};
  let anchor = path.join(appsDir, app, 'package.json');
  for (const name of CHAIN) {
    roots[name] = packageRoot(createRequire(anchor).resolve(name), name);
    anchor = path.join(roots[name], 'package.json');
  }
  return roots;
}

function versionOf(root: string): string {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}

const roots = resolveChain('admin-web');
const requireFromAjv = createRequire(path.join(roots.ajv, 'package.json'));
const uri = requireFromAjv('fast-uri');
const ajvModule = createRequire(path.join(roots['schema-utils'], 'package.json'))('ajv');
const Ajv = ajvModule.default ?? ajvModule;

describe('fast-uri resolved through the Sentry → webpack → Ajv chain', () => {
  it.each(['admin-web', 'buyer-web', 'seller-web'])('%s resolves a patched 3.x fast-uri', (app) => {
    const [major, minor, patch] = versionOf(resolveChain(app)['fast-uri']).split('.').map(Number);
    expect(major).toBe(3);
    expect(minor > 1 || (minor === 1 && patch >= 9)).toBe(true);
  });

  it('Ajv uses this exact fast-uri instance as its URI resolver', () => {
    expect(new Ajv().opts.uriResolver).toBe(uri);
  });
});

describe('GHSA-w74x-v6f9-j3xg — percent-encoded scheme', () => {
  it('does not decode %6Aavascript into an active javascript: scheme', () => {
    const parsed = uri.parse('%6Aavascript:alert(1)');
    expect(parsed.scheme).toBe('%6Aavascript');
    expect(parsed.error).toBe('URI scheme is malformed.');
    expect(uri.normalize('%6Aavascript:alert(1)')).toBe('%6Aavascript:alert(1)');
    expect(uri.equal('%6Aavascript:alert(1)', 'javascript:alert(1)')).toBe(false);
    expect(() => uri.resolve('https://example.org/a/b', '%6Aavascript:alert(1)')).toThrow('URI scheme is malformed.');
  });

  it('does not decode %68ttp into http:', () => {
    expect(uri.parse('%68ttp://evil.example/').error).toBeDefined();
    expect(uri.normalize('%68ttp://evil.example/')).not.toMatch(/^http:/i);
  });
});

describe('GHSA-wjr9-j795-jxcr — malformed host', () => {
  it('flags a double-@ authority instead of trusting the last host', () => {
    const parsed = uri.parse('http://a@b@evil.example/');
    expect(parsed.host).toBe('b@evil.example');
    expect(parsed.error).toBe('URI host is malformed.');
    expect(uri.equal('http://a@b@evil.example/', 'http://a@evil.example/')).toBe(false);
  });

  it('flags a TAB inside the host instead of silently stripping it', () => {
    const parsed = uri.parse('https://exam\tple.org/');
    expect(parsed.host).toBe('exam\tple.org');
    expect(parsed.error).toBe('URI host is malformed.');
    expect(uri.equal('https://exam\tple.org/', 'https://example.org/')).toBe(false);
  });
});

describe('GHSA-xhq7-xmqj-769h — parent-relative normalization', () => {
  it('keeps ../x parent-relative', () => {
    const base = 'https://example.org/a/b/c';
    expect(uri.normalize('../x')).toBe('../x');
    expect(uri.equal('../x', 'x')).toBe(false);
    expect(uri.resolve(base, '../x')).toBe('https://example.org/a/x');
    expect(uri.resolve(base, uri.normalize('../x'))).toBe(uri.resolve(base, '../x'));
  });
});

describe('GHSA-333x-w4r6-6crp — suffix serialization of a colon path', () => {
  // Scope: this fixes the no-authority case where the scheme is dropped on
  // serialization. Suffix mode with an authority stays ambiguous by design
  // (see the fast-uri README) — fast-uri is not a general URL sanitizer.
  const components = { scheme: 'custom', path: 'javascript:alert(1)' };

  it('escapes the exposed colon', () => {
    expect(uri.serialize(components, { reference: 'suffix' })).toBe('javascript%3Aalert(1)');
  });

  it('prefixes ./ when escaping is skipped', () => {
    expect(uri.serialize(components, { reference: 'suffix', skipEscape: true })).toBe('./javascript:alert(1)');
  });
});

describe('legitimate URIs still work', () => {
  it('parses query + fragment and resolves absolute paths', () => {
    const parsed = uri.parse('https://example.org/b?q=hello#frag');
    expect(parsed.error).toBeUndefined();
    expect(parsed.query).toBe('q=hello');
    expect(parsed.fragment).toBe('frag');
    expect(uri.resolve('https://example.org/a/b', '/b?q=hello#frag')).toBe('https://example.org/b?q=hello#frag');
  });

  it('accepts IPv6 literals and IDN hosts', () => {
    expect(uri.parse('http://[2001:db8::1]:8080/p').error).toBeUndefined();
    expect(uri.normalize('http://[2001:db8::1]:8080/p')).toBe('http://[2001:db8::1]:8080/p');
    expect(uri.parse('https://xn--mller-kva.example/').error).toBeUndefined();
    expect(uri.normalize('https://müller.example/')).toBe('https://xn--mller-kva.example/');
  });

  it('Ajv still resolves $id-relative $refs across schemas', () => {
    const ajv = new Ajv();
    ajv.addSchema({
      $id: 'https://teka.cd/schemas/defs.json',
      $defs: { phone: { type: 'string', pattern: '^\\+243\\d{9}$' } },
    });
    const validate = ajv.compile({
      $id: 'https://teka.cd/schemas/user.json',
      type: 'object',
      properties: { phone: { $ref: 'defs.json#/$defs/phone' } },
      required: ['phone'],
    });
    expect(validate({ phone: '+243812345678' })).toBe(true);
    expect(validate({ phone: '0812345678' })).toBe(false);
  });
});
