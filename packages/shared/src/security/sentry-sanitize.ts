/**
 * Sentry payload sanitiser — the single implementation for all four
 * JavaScript surfaces (api, buyer-web, seller-web, admin-web).
 *
 * ## Why this exists
 *
 * `@sentry/node` 10.x enables `requestDataIntegration` by default, and its
 * `DEFAULT_INCLUDE` is `{ cookies: true, data: true, headers: true,
 * query_string: true, url: true }`. `httpIntegration` defaults
 * `maxRequestBodySize` to `'medium'`, so the SDK patches every incoming
 * request to buffer up to 10 kB of body. `sendDefaultPii` gates only the
 * client IP — it does NOT gate cookies, headers or the body.
 *
 * The practical consequence, measured against the shipping configuration:
 * a single 500 on `POST /v1/auth/login/email` sent Sentry the plaintext
 * password, the `Authorization` header, both session cookies, the OTP code
 * and any `?token=` in the query string. The only control in place was a
 * `+243` phone regex.
 *
 * ## Strategy — two layers
 *
 * 1. **Do not collect.** Callers pass `maxRequestBodySize: 'none'` to
 *    `httpIntegration` and `include: { cookies: false, data: false }` to
 *    `requestDataIntegration`, so the body and cookies never enter the
 *    event in the first place. Cheapest and strongest.
 * 2. **Sanitise what remains.** This module is the `beforeSend` /
 *    `beforeBreadcrumb` hook. It is the backstop for anything layer 1 does
 *    not cover: headers we deliberately keep, URLs, query strings,
 *    breadcrumbs, tags, extras, contexts and the user object.
 *
 * ## What is deliberately KEPT
 *
 * Stack traces, exception type and message, route/path, HTTP method,
 * response status, `Content-Type`, `User-Agent`, `X-Teka-Surface`, the
 * opaque internal user id, release, environment and every non-sensitive
 * tag. This is data minimisation, not switching observability off.
 *
 * ## Safety properties
 *
 * Synchronous, allocation-bounded and total: recursion is capped by
 * {@link MAX_DEPTH} and {@link MAX_NODES}, cycles are tracked, and the whole
 * body is wrapped so a malformed event can never throw into the SDK. On an
 * internal error it fails CLOSED — the request, extras, contexts and
 * breadcrumbs are dropped rather than sent unsanitised.
 */

/** Replacement marker. Matches Sentry's own server-side convention. */
export const FILTERED = '[Filtered]';

/** Recursion depth cap. Deeper values are replaced with `FILTERED`. */
const MAX_DEPTH = 8;

/** Total node budget per event. Once spent, remaining values are dropped. */
const MAX_NODES = 5000;

/**
 * Header names never sent, in any casing. `referer` is not here: it is
 * URL-sanitised instead, because the referring route is useful.
 */
const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
  'x-refresh-token',
  'x-csrf-token',
  'x-xsrf-token',
  'x-session-id',
  'x-forwarded-authorization',
]);

/**
 * A key whose VALUE is always replaced, wherever it appears — body, extra,
 * tag, context, breadcrumb data or query parameter.
 *
 * Deliberately matched as a substring so `currentPassword`, `newPassword`,
 * `access_token` and `payoutPhone` are all caught. `code` is matched only
 * as a whole word or with an OTP/verification qualifier, because bare
 * `code` collides with `statusCode`, `errorCode` and `postalCode`, which
 * are useful and not sensitive.
 */
const SENSITIVE_KEY = new RegExp(
  [
    'pass(word|wd|phrase)?',
    'secret',
    'token',
    'otp',
    'auth(orization)?',
    'cookie',
    'session',
    'credential',
    'api[-_]?key',
    'signature',
    'jwt',
    'bearer',
    'private[-_]?key',
    'client[-_]?secret',
    'pin',
    'cvv',
    'iban',
    'payout(phone|number|account|destination)',
    '(^|[^a-z])(verification|otp|sms|confirmation)[-_]?code([^a-z]|$)',
    '^code$',
  ].join('|'),
  'i',
);

/** Query-parameter names whose value is replaced but whose NAME is kept. */
const SENSITIVE_QUERY_PARAM = new RegExp(
  [
    'token',
    'otp',
    'code',
    'pass(word)?',
    'secret',
    'sig(nature)?',
    'api[-_]?key',
    'auth',
    'session',
    'jwt',
    'access[-_]?token',
    'refresh[-_]?token',
    'email',
    'mail',
    'phone',
    'tel',
    'msisdn',
  ].join('|'),
  'i',
);

/** Keys whose string value is treated as a URL and query-sanitised. */
const URL_LIKE_KEY = /^(url|uri|href|from|to|location|referer|referrer|endpoint|link)$/i;

/** DRC phone numbers. Buyer auth identifier — Rule 13. */
const PHONE_REGEX = /\+?243[\s.-]?\d{2}[\s.-]?\d{3}[\s.-]?\d{4}\b/g;

/** Any email address. Never needed to debug a French error string. */
const EMAIL_REGEX = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** A JWT, wherever it is embedded. */
const JWT_REGEX = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** `Bearer <token>` inside a free-text string. */
const BEARER_REGEX = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** A Cloudinary signed/private delivery URL (identity documents). */
const CLOUDINARY_REGEX = /https?:\/\/[^\s"'<>]*cloudinary\.com[^\s"'<>]*/gi;

/**
 * `key=value` / `key: value` written inline in a free-text string.
 *
 * This matters more than it looks: `consoleIntegration` is a Sentry default,
 * so every Nest `Logger` line becomes a breadcrumb, and this codebase logs in
 * exactly that style (`code=${code}`, `phone=${phone}`, `resend=${...}`). Key
 * matching alone never sees these, because there is no object key to inspect.
 *
 * `\b` before the name keeps `statusCode=500`, `status_code=500` and
 * `errorCode=P2002` intact — neither has a word boundary before `code`.
 */
const INLINE_SECRET_REGEX = new RegExp(
  '\\b(pass(?:word|wd|phrase)?|secret|token|otp|auth(?:orization)?|cookie|session|credential|api[-_]?key|apikey|signature|jwt|bearer|private[-_]?key|client[-_]?secret|pin|cvv|iban|code)' +
    '(\\s*[=:]\\s*)' +
    // Idempotent: a value already replaced is not replaced again. Breadcrumbs
    // pass through both `beforeBreadcrumb` and `beforeSend`, so scrubString
    // runs twice over the same string.
    '(?!\\[Filtered\\])' +
    '("[^"]*"|\'[^\']*\'|[^\\s,;&)}\\]]+)',
  'gi',
);

/**
 * Value-level scrub applied to every string that survives key filtering.
 * Order matters: Cloudinary and JWT before the generic patterns.
 */
export function scrubString(input: string): string {
  if (!input) return input;
  let out = input;
  // Order is load-bearing. JWT and Bearer run BEFORE the inline `key=value`
  // rule: otherwise `Authorization: Bearer <token>` matches the inline rule,
  // which consumes only the word `Bearer` and leaves the token in place.
  out = out.replace(CLOUDINARY_REGEX, '[document-link]');
  out = out.replace(JWT_REGEX, FILTERED);
  out = out.replace(BEARER_REGEX, `Bearer ${FILTERED}`);
  out = out.replace(INLINE_SECRET_REGEX, (_m, name, sep) => `${name}${sep}${FILTERED}`);
  out = out.replace(PHONE_REGEX, '[phone]');
  out = out.replace(EMAIL_REGEX, '[email]');
  return out;
}

/**
 * Redact the sensitive parameters of a URL or a bare query string while
 * keeping the path and the parameter NAMES.
 *
 * `/compte/reset?token=abc&ville=lubumbashi`
 *   becomes `/compte/reset?token=[Filtered]&ville=lubumbashi`
 *
 * Keeping the shape is the point: the route and which parameters were
 * present is exactly what makes an error reproducible, and none of it is
 * secret. Falls back to a plain string scrub if the value does not parse.
 */
export function sanitizeUrl(value: string): string {
  if (!value) return value;
  try {
    const questionMark = value.indexOf('?');
    // A bare query string, e.g. the `query_string` event field.
    if (questionMark === -1 && !value.includes('=')) return scrubString(value);

    const head = questionMark === -1 ? '' : value.slice(0, questionMark);
    const rawQuery = questionMark === -1 ? value : value.slice(questionMark + 1);
    if (!rawQuery) return scrubString(value);

    const hashIndex = rawQuery.indexOf('#');
    const fragment = hashIndex === -1 ? '' : rawQuery.slice(hashIndex);
    const query = hashIndex === -1 ? rawQuery : rawQuery.slice(0, hashIndex);

    const parts = query.split('&').map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      return SENSITIVE_QUERY_PARAM.test(name)
        ? `${name}=${FILTERED}`
        : `${name}=${scrubString(pair.slice(eq + 1))}`;
    });

    // Preserve the original shape: a bare query string (the `query_string`
    // event field) must not gain a leading `?`.
    const prefix = questionMark === -1 ? '' : `${scrubString(head)}?`;
    return `${prefix}${parts.join('&')}${fragment}`;
  } catch {
    return FILTERED;
  }
}

/** Mutable budget carried through one sanitisation pass. */
interface Budget {
  nodes: number;
  seen: WeakSet<object>;
}

/**
 * Recursively sanitise an arbitrary value. Keys are inspected, values are
 * scrubbed. Object keys themselves are never rewritten — they are Sentry's
 * structure and carry no user input.
 */
function sanitizeValue(value: unknown, depth: number, budget: Budget, key?: string): unknown {
  if (budget.nodes++ > MAX_NODES) return FILTERED;
  if (depth > MAX_DEPTH) return FILTERED;

  if (key && SENSITIVE_KEY.test(key)) return FILTERED;

  if (typeof value === 'string') {
    return key && URL_LIKE_KEY.test(key) ? sanitizeUrl(value) : scrubString(value);
  }
  if (value === null || typeof value !== 'object') return value;

  if (budget.seen.has(value as object)) return FILTERED;
  budget.seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1, budget, key));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = sanitizeValue(v, depth + 1, budget, k);
  }
  return out;
}

/** Header maps are sanitised by name, not by generic key matching. */
function sanitizeHeaders(headers: unknown, budget: Budget): unknown {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return sanitizeValue(headers, 1, budget);
  }
  const out: Record<string, unknown> = {};
  for (const [name, val] of Object.entries(headers as Record<string, unknown>)) {
    if (SENSITIVE_HEADERS.has(name.toLowerCase())) {
      out[name] = FILTERED;
    } else if (typeof val === 'string') {
      out[name] = URL_LIKE_KEY.test(name) || /referer|referrer|location/i.test(name)
        ? sanitizeUrl(val)
        : scrubString(val);
    } else {
      out[name] = sanitizeValue(val, 2, budget, name);
    }
  }
  return out;
}

/** Minimal shape we touch. Structurally typed so no SDK import is needed. */
interface SanitizableEvent {
  request?: {
    headers?: unknown;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
    url?: unknown;
    method?: unknown;
    [k: string]: unknown;
  };
  user?: Record<string, unknown>;
  extra?: unknown;
  tags?: unknown;
  contexts?: unknown;
  breadcrumbs?: unknown;
  message?: unknown;
  transaction?: unknown;
  exception?: unknown;
  [k: string]: unknown;
}

/**
 * `beforeSend` hook. Returns a sanitised copy of the event.
 *
 * Never returns `null` for a well-formed event: dropping errors would trade
 * one problem for a worse one. It returns `null` only if sanitisation and
 * the fail-closed fallback both throw, which cannot happen for any event
 * the SDK produces.
 */
export function sanitizeSentryEvent<T extends object>(event: T): T | null {
  if (!event || typeof event !== 'object') return event ?? null;
  try {
    const budget: Budget = { nodes: 0, seen: new WeakSet() };
    const out = { ...(event as unknown as SanitizableEvent) } as SanitizableEvent;

    if (out.request && typeof out.request === 'object') {
      const req = { ...out.request };
      // Layer 1 should have prevented these; drop them if anything changes.
      delete req.cookies;
      if (req.data !== undefined) req.data = FILTERED;
      if (req.headers !== undefined) req.headers = sanitizeHeaders(req.headers, budget);
      if (typeof req.url === 'string') req.url = sanitizeUrl(req.url);
      if (typeof req.query_string === 'string') req.query_string = sanitizeUrl(req.query_string);
      // method, status and anything else pass through the generic pass.
      for (const [k, v] of Object.entries(req)) {
        if (k === 'headers' || k === 'url' || k === 'query_string' || k === 'data') continue;
        req[k] = sanitizeValue(v, 2, budget, k);
      }
      out.request = req;
    }

    if (out.user && typeof out.user === 'object') {
      const user = { ...out.user };
      // The opaque internal id is the one identifier worth keeping.
      delete user.email;
      delete user.username;
      delete user.ip_address;
      delete user.geo;
      delete user.name;
      out.user = sanitizeValue(user, 1, budget) as Record<string, unknown>;
    }

    for (const field of ['extra', 'tags', 'contexts', 'breadcrumbs', 'message'] as const) {
      if (out[field] !== undefined) out[field] = sanitizeValue(out[field], 1, budget, field);
    }
    if (typeof out.transaction === 'string') out.transaction = sanitizeUrl(out.transaction);
    if (out.exception !== undefined) out.exception = sanitizeValue(out.exception, 1, budget);

    return out as T;
  } catch {
    // Fail closed: keep the error signal, drop every container that could
    // carry user input.
    try {
      const stripped = { ...(event as unknown as SanitizableEvent) } as SanitizableEvent;
      delete stripped.request;
      delete stripped.extra;
      delete stripped.contexts;
      delete stripped.breadcrumbs;
      delete stripped.user;
      return stripped as T;
    } catch {
      return null;
    }
  }
}

/**
 * `beforeBreadcrumb` hook. Same rules, applied to a single breadcrumb.
 * Returns `null` only if the input is not an object, which the SDK treats
 * as "drop this breadcrumb".
 */
export function sanitizeSentryBreadcrumb<T extends object>(breadcrumb: T): T | null {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb ?? null;
  try {
    const budget: Budget = { nodes: 0, seen: new WeakSet() };
    return sanitizeValue(breadcrumb, 0, budget) as T;
  } catch {
    return null;
  }
}
