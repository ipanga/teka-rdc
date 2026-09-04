import { describe, expect, it } from 'vitest';
import { redirectParamFrom, resolvePostLoginRedirect } from './post-login-redirect';

describe('resolvePostLoginRedirect — unauthenticated deep link → login → back', () => {
  it('honours an internal dashboard path with its query (payout deep link)', () => {
    const target = '/dashboard/earnings?tab=payouts&payout=0f1e2d3c-4b5a-4c6d-8e7f-90a1b2c3d4e5';
    expect(resolvePostLoginRedirect(target)).toBe(target);
    expect(resolvePostLoginRedirect(encodeURIComponent(target))).toBe(target);
    expect(redirectParamFrom(`?redirect=${encodeURIComponent(target)}`)).toBe(target);
  });
  it('falls back to the dashboard for missing, external, protocol-relative, non-dashboard or undecodable values', () => {
    expect(resolvePostLoginRedirect(null)).toBe('/dashboard');
    expect(resolvePostLoginRedirect('')).toBe('/dashboard');
    expect(resolvePostLoginRedirect('https://evil.example/x')).toBe('/dashboard');
    expect(resolvePostLoginRedirect('//evil.example')).toBe('/dashboard');
    expect(resolvePostLoginRedirect('/login?x=1')).toBe('/dashboard');
    expect(resolvePostLoginRedirect('/admin')).toBe('/dashboard');
    expect(resolvePostLoginRedirect('%E0%A4%A')).toBe('/dashboard');
    expect(redirectParamFrom('')).toBeNull();
  });
});
