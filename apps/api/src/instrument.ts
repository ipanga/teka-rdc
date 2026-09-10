/**
 * Sentry SDK bootstrap.
 *
 * Sentry v10 (and v8+) require `Sentry.init` to be called BEFORE any other
 * module is imported so the SDK can monkey-patch node's `http`, `fetch`,
 * Prisma, etc. for automatic instrumentation. This file is therefore
 * imported as the very first line of `main.ts` — do not add anything else
 * here, do not import it from anywhere else.
 *
 * Behaviour:
 * - If `SENTRY_DSN` is unset (development, CI, prod before the DSN is
 *   provisioned), `init` is skipped and every `Sentry.captureException`
 *   downstream becomes a no-op. Safe to merge before the DSN exists.
 * - We deliberately set `tracesSampleRate: 0` — only errors are captured
 *   for now. Add perf tracing in a separate PR once we have signal on
 *   what to watch.
 *
 * ## Request-data minimisation (2026-09-09)
 *
 * `@sentry/node` 10.x turns `requestDataIntegration` on by default with
 * `DEFAULT_INCLUDE = { cookies: true, data: true, headers: true,
 * query_string: true, url: true }`, and `httpIntegration` defaults
 * `maxRequestBodySize` to `'medium'`, buffering up to 10 kB of every
 * incoming body. `sendDefaultPii` gates only the client IP; it does NOT
 * gate cookies, headers or the body.
 *
 * Measured against the previous configuration of this file, one 500 on
 * `POST /v1/auth/login/email` sent Sentry the plaintext password, the
 * `Authorization` header, both session cookies, the OTP code and any
 * `?token=` in the query string. The only control was a `+243` regex.
 *
 * Two layers now:
 *   1. do not collect — `maxRequestBodySize: 'none'` so the body is never
 *      buffered, and `include: { cookies: false, data: false }` so neither
 *      can be attached even if something upstream populates it;
 *   2. sanitise what remains — `sanitizeSentryEvent` scrubs headers, URLs,
 *      query strings, breadcrumbs, tags, extras, contexts and the user.
 *
 * Kept on purpose: stack traces, exception type and message, route, HTTP
 * method, status, `User-Agent`, `Content-Type`, `X-Teka-Surface`, the
 * opaque internal user id, release and environment.
 */
import * as Sentry from '@sentry/node';
import {
  sanitizeSentryEvent,
  sanitizeSentryBreadcrumb,
} from '@teka/shared';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    // Explicit environment — was reading NODE_ENV which is "production"
    // in both staging and prod containers. SENTRY_ENVIRONMENT lets ops
    // separate them in the Sentry UI. Falls back to NODE_ENV for
    // backwards compatibility.
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    // Sample 100% of errors. The DRC traffic volume is low enough that
    // this is fine and we don't want to lose signal to client-side
    // sampling. Revisit if/when error volume grows.
    sampleRate: 1.0,
    // Never attach the client IP. This is the SDK default; pinned so a
    // future default change or a copy-paste cannot silently enable it.
    sendDefaultPii: false,
    integrations: [
      // A user-supplied integration replaces the default of the same name
      // (see `filterDuplicates` in @sentry/core), so these override rather
      // than duplicate the defaults.
      Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
      Sentry.requestDataIntegration({
        include: { cookies: false, data: false, headers: true, query_string: true, url: true, ip: false },
      }),
    ],
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeSentryBreadcrumb(breadcrumb);
    },
  });
}
