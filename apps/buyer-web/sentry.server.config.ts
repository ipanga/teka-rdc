// Sentry server (Node.js runtime) SDK bootstrap.
//
// Reads SENTRY_DSN_BUYER_WEB from runtime env (not NEXT_PUBLIC_ — server-only).
// When unset, init is skipped. Loaded by instrumentation.ts.
import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeSentryBreadcrumb,
} from './sentry-scrub';

if (process.env.SENTRY_DSN_BUYER_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_BUYER_WEB,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    sampleRate: 1.0,
    // Never attach the client IP. SDK default; pinned so a future
    // default change or a copy-paste cannot silently enable it.
    sendDefaultPii: false,
    // Layer 1 — do not collect. `@sentry/node` 10.x defaults
    // `maxIncomingRequestBodySize` to 'medium' and requestDataIntegration's
    // include to `{ cookies: true, data: true, ... }`; `sendDefaultPii`
    // gates only the IP. A user integration replaces the default of the
    // same name, so these override rather than duplicate.
    integrations: [
      Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
      Sentry.requestDataIntegration({
        include: {
          cookies: false,
          data: false,
          headers: true,
          query_string: true,
          url: true,
          ip: false,
        },
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
