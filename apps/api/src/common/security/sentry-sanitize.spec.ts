import {
  FILTERED,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeUrl,
  scrubString,
} from '@teka/shared';

/**
 * Sentry request-data minimisation (2026-09-09).
 *
 * `@sentry/node` 10.x enables `requestDataIntegration` by default with
 * `{ cookies: true, data: true, headers: true, query_string: true, url: true }`
 * and buffers up to 10 kB of every request body. `sendDefaultPii` gates only
 * the client IP. Measured against the previous configuration, a single 500 on
 * `POST /v1/auth/login/email` sent Sentry the plaintext password, the
 * `Authorization` header, both session cookies, the OTP code and any
 * `?token=` — the only control was a `+243` phone regex.
 *
 * These tests exercise the sanitiser directly rather than mocking around
 * `captureException`, so they fail if the rule set regresses regardless of how
 * the SDK is wired.
 */
describe('sanitizeSentryEvent', () => {
  /** A representative event carrying every secret we care about. */
  function eventWithSecrets() {
    return {
      exception: {
        values: [{ type: 'Error', value: 'boom', stacktrace: { frames: [{ filename: 'a.ts' }] } }],
      },
      request: {
        method: 'POST',
        url: 'https://api.teka.cd/api/v1/auth/login/email?token=RESET_SECRET&ville=lubumbashi',
        query_string: 'token=RESET_SECRET&ville=lubumbashi',
        headers: {
          authorization: 'Bearer SECRET_TOKEN',
          cookie: 'teka_seller_access=SECRET_COOKIE',
          'user-agent': 'Mozilla/5.0',
          'content-type': 'application/json',
          'x-teka-surface': 'seller',
        },
        cookies: { teka_seller_access: 'SECRET_COOKIE' },
        data: { email: 'marie@example.cd', password: 'SuperSecret123', otp: '123456' },
      },
      user: { id: 'user-uuid-1', email: 'marie@example.cd', ip_address: '41.0.0.1' },
      tags: { method: 'POST', kind: 'unhandled' },
      extra: { url: '/api/v1/auth/login/email?token=RESET_SECRET' },
      breadcrumbs: [
        { category: 'http', data: { url: 'https://api.teka.cd/x?otp=999111', method: 'GET' } },
      ],
      environment: 'production',
      release: 'abc123',
    };
  }

  const SECRETS = [
    'SuperSecret123',
    'SECRET_TOKEN',
    'SECRET_COOKIE',
    'RESET_SECRET',
    '123456',
    '999111',
    'marie@example.cd',
  ];

  it('removes every secret from the serialized event', () => {
    const out = JSON.stringify(sanitizeSentryEvent(eventWithSecrets()));
    for (const secret of SECRETS) {
      expect(out).not.toContain(secret);
    }
  });

  it('drops cookies entirely and redacts the body', () => {
    const out = sanitizeSentryEvent(eventWithSecrets()) as any;
    expect(out.request).not.toHaveProperty('cookies');
    expect(out.request.data).toBe(FILTERED);
  });

  it('redacts sensitive headers but keeps the useful ones', () => {
    const out = sanitizeSentryEvent(eventWithSecrets()) as any;
    expect(out.request.headers.authorization).toBe(FILTERED);
    expect(out.request.headers.cookie).toBe(FILTERED);
    expect(out.request.headers['user-agent']).toBe('Mozilla/5.0');
    expect(out.request.headers['content-type']).toBe('application/json');
    expect(out.request.headers['x-teka-surface']).toBe('seller');
  });

  it('keeps the route and the parameter NAMES while redacting their values', () => {
    const out = sanitizeSentryEvent(eventWithSecrets()) as any;
    expect(out.request.url).toBe(
      'https://api.teka.cd/api/v1/auth/login/email?token=[Filtered]&ville=lubumbashi',
    );
    // A bare query string must not gain a leading `?`.
    expect(out.request.query_string).toBe('token=[Filtered]&ville=lubumbashi');
  });

  it('keeps the opaque user id and drops the identifying fields', () => {
    const out = sanitizeSentryEvent(eventWithSecrets()) as any;
    expect(out.user.id).toBe('user-uuid-1');
    expect(out.user).not.toHaveProperty('email');
    expect(out.user).not.toHaveProperty('ip_address');
  });

  it('keeps the exception, stack frames, tags, release and environment', () => {
    const out = sanitizeSentryEvent(eventWithSecrets()) as any;
    expect(out.exception.values[0].type).toBe('Error');
    expect(out.exception.values[0].value).toBe('boom');
    expect(out.exception.values[0].stacktrace.frames).toHaveLength(1);
    expect(out.tags).toEqual({ method: 'POST', kind: 'unhandled' });
    expect(out.request.method).toBe('POST');
    expect(out.environment).toBe('production');
    expect(out.release).toBe('abc123');
  });

  it('does not mutate the event it was given', () => {
    const event = eventWithSecrets();
    sanitizeSentryEvent(event);
    expect(event.request.headers.authorization).toBe('Bearer SECRET_TOKEN');
    expect(event.request.data.password).toBe('SuperSecret123');
  });

  it('redacts sensitive keys wherever they are nested', () => {
    const out = JSON.stringify(
      sanitizeSentryEvent({
        extra: {
          payload: {
            deep: { currentPassword: 'p1', refresh_token: 't1', payoutPhone: '+243812345678' },
          },
          list: [{ apiKey: 'k1' }, { otpCode: '424242' }],
        },
      }),
    );
    for (const secret of ['p1', 't1', 'k1', '424242', '+243812345678']) {
      expect(out).not.toContain(secret);
    }
  });

  it('keeps non-sensitive lookalike keys such as statusCode and postalCode', () => {
    const out = sanitizeSentryEvent({
      extra: { statusCode: 500, errorCode: 'P2002', postalCode: '1234', city: 'Lubumbashi' },
    }) as any;
    expect(out.extra.statusCode).toBe(500);
    expect(out.extra.errorCode).toBe('P2002');
    expect(out.extra.postalCode).toBe('1234');
    expect(out.extra.city).toBe('Lubumbashi');
  });

  it('tolerates a malformed event without throwing', () => {
    expect(() => sanitizeSentryEvent({} as any)).not.toThrow();
    expect(() => sanitizeSentryEvent({ request: null } as any)).not.toThrow();
    expect(() => sanitizeSentryEvent({ request: 'nonsense' } as any)).not.toThrow();
    expect(() => sanitizeSentryEvent({ user: 42 } as any)).not.toThrow();
    expect(sanitizeSentryEvent(null as any)).toBeNull();
  });

  it('terminates on a cyclic event instead of recursing forever', () => {
    const cyclic: any = { extra: {} };
    cyclic.extra.self = cyclic.extra;
    expect(() => sanitizeSentryEvent(cyclic)).not.toThrow();
  });

  it('bounds deep nesting rather than walking it all', () => {
    let deep: any = { secretless: 'leaf' };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    const out = sanitizeSentryEvent({ extra: deep }) as any;
    expect(JSON.stringify(out)).toContain(FILTERED);
  });
});

describe('sanitizeSentryBreadcrumb', () => {
  it('redacts a URL in breadcrumb data while keeping the route', () => {
    const out = sanitizeSentryBreadcrumb({
      category: 'navigation',
      data: { from: '/compte?token=abc123', to: '/compte/profil' },
    }) as any;
    expect(out.data.from).toBe('/compte?token=[Filtered]');
    expect(out.data.to).toBe('/compte/profil');
    expect(out.category).toBe('navigation');
  });

  it('never throws on a malformed breadcrumb', () => {
    expect(() => sanitizeSentryBreadcrumb({} as any)).not.toThrow();
    expect(sanitizeSentryBreadcrumb(null as any)).toBeNull();
  });
});

describe('scrubString', () => {
  it('replaces DRC phone numbers in several written forms', () => {
    expect(scrubString('appel +243812345678 reçu')).toBe('appel [phone] reçu');
    expect(scrubString('+243 81 234 5678')).toBe('[phone]');
    expect(scrubString('243812345678')).toBe('[phone]');
  });

  it('replaces emails, JWTs, bearer tokens and Cloudinary document links', () => {
    expect(scrubString('de marie@example.cd')).toBe('de [email]');
    expect(
      scrubString('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'),
    ).toBe(FILTERED);
    // A bare `Bearer <token>` in prose keeps the scheme; when it follows an
    // `authorization:` key the inline rule also redacts the scheme word.
    expect(scrubString('jeton Bearer abcdef1234567890 recu')).toBe(
      `jeton Bearer ${FILTERED} recu`,
    );
    expect(scrubString('Authorization: Bearer abcdef1234567890')).not.toContain(
      'abcdef1234567890',
    );
    expect(scrubString('https://res.cloudinary.com/teka/image/private/x.jpg')).toBe(
      '[document-link]',
    );
  });

  // `consoleIntegration` is a Sentry default, so every Nest Logger line
  // becomes a breadcrumb — and this codebase logs in `key=value` style.
  it('redacts inline key=value secrets written into a log line', () => {
    expect(scrubString('debug dump password=SuperSecret123')).toBe(
      `debug dump password=${FILTERED}`,
    );
    expect(scrubString('[MOCK WHATSAPP OTP] phone=+243812345678 code=123456')).toBe(
      `[MOCK WHATSAPP OTP] phone=[phone] code=${FILTERED}`,
    );
    expect(scrubString('Authorization: Bearer abcdef1234567890')).not.toContain(
      'abcdef1234567890',
    );
  });

  it('keeps statusCode, errorCode and status_code, which have no word boundary before "code"', () => {
    const line = 'statusCode=500 errorCode=P2002 status_code=404';
    expect(scrubString(line)).toBe(line);
  });

  it('is idempotent — breadcrumbs pass through beforeBreadcrumb AND beforeSend', () => {
    const once = scrubString('password=SuperSecret123 token=abc.def.ghi');
    expect(scrubString(once)).toBe(once);
  });

  it('leaves ordinary French copy untouched', () => {
    const copy = 'Commande introuvable pour la ville de Lubumbashi';
    expect(scrubString(copy)).toBe(copy);
  });
});

describe('bounded work — CodeQL js/polynomial-redos', () => {
  // The Cloudinary pattern originally had an unbounded `[^\s"'<>]*` on both
  // sides of the literal, which is polynomial on a long non-matching string.
  // scrubString runs inside beforeSend on data an attacker can influence.
  it('handles a long non-matching URL promptly', () => {
    const hostile = `https://${'a'.repeat(60_000)}`;
    const started = Date.now();
    expect(typeof scrubString(hostile)).toBe('string');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('handles a query string with very many parameters promptly', () => {
    const started = Date.now();
    expect(typeof sanitizeUrl(`/x?${'a=b&'.repeat(20_000)}`)).toBe('string');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('truncates a string past the ceiling instead of scanning all of it', () => {
    expect(scrubString('x'.repeat(20_000)).length).toBeLessThanOrEqual(8192);
  });

  it('still redacts a real Cloudinary document URL after the bounds', () => {
    expect(scrubString('https://res.cloudinary.com/teka/image/private/x.jpg')).toBe(
      '[document-link]',
    );
  });
});

describe('sanitizeUrl', () => {
  it('keeps the path and parameter names', () => {
    expect(sanitizeUrl('/compte/reset?token=abc&ville=kolwezi')).toBe(
      '/compte/reset?token=[Filtered]&ville=kolwezi',
    );
  });

  it('redacts every sensitive parameter name we care about', () => {
    const q = sanitizeUrl(
      '/x?token=a&otp=b&code=c&password=d&signature=e&api_key=f&email=g&phone=h&session=i',
    );
    expect(q).not.toMatch(/=[abcdefghi](&|$)/);
    expect(q).toContain('token=[Filtered]');
    expect(q).toContain('email=[Filtered]');
  });

  it('leaves a path with no query string alone', () => {
    expect(sanitizeUrl('/produits/telephones')).toBe('/produits/telephones');
  });

  it('preserves the fragment', () => {
    expect(sanitizeUrl('/x?token=a#section')).toBe('/x?token=[Filtered]#section');
  });
});
