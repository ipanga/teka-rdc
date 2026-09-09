import { describe, expect, it } from 'vitest';
import {
  FILTERED,
  sanitizeSentryEvent,
  sanitizeSentryBreadcrumb,
} from '../../sentry-scrub';

/** Only the fields this test reads back. */
interface SanitizedEvent {
  request: {
    headers: Record<string, string>;
    url: string;
    cookies?: unknown;
  };
  user: { id: string };
}

/**
 * Guards the wiring, not the rule set: the exhaustive rule tests live in
 * apps/api/src/common/security/sentry-sanitize.spec.ts against the same
 * @teka/shared implementation. This asserts that this app's sentry-scrub
 * really re-exports it, so the three runtime configs cannot silently fall
 * back to an unsanitised beforeSend.
 */
describe('admin-web sentry-scrub', () => {
  it('re-exports the shared sanitiser', () => {
    expect(typeof sanitizeSentryEvent).toBe('function');
    expect(typeof sanitizeSentryBreadcrumb).toBe('function');
    expect(FILTERED).toBe('[Filtered]');
  });

  it('strips cookies, body, auth header and query secrets from an event', () => {
    const out = sanitizeSentryEvent({
      request: {
        url: '/x?token=SECRET_TOKEN&ville=likasi',
        headers: { authorization: 'Bearer SECRET_BEARER', 'user-agent': 'UA' },
        cookies: { teka_admin_access: 'SECRET_COOKIE' },
        data: { password: 'SuperSecret123' },
      },
      user: { id: 'u1', email: 'marie@example.cd' },
    }) as SanitizedEvent;

    const blob = JSON.stringify(out);
    for (const secret of ['SECRET_TOKEN', 'SECRET_BEARER', 'SECRET_COOKIE', 'SuperSecret123', 'marie@example.cd']) {
      expect(blob).not.toContain(secret);
    }
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request.headers['user-agent']).toBe('UA');
    expect(out.request.url).toBe('/x?token=[Filtered]&ville=likasi');
    expect(out.user.id).toBe('u1');
  });

  it('never throws on a malformed event', () => {
    expect(() => sanitizeSentryEvent({} as never)).not.toThrow();
    expect(() => sanitizeSentryBreadcrumb({} as never)).not.toThrow();
  });
});
