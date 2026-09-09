// Sentry edge (middleware / edge runtime) SDK bootstrap for seller-web.
// See apps/buyer-web/sentry.edge.config.ts for the full rationale.
import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeSentryBreadcrumb,
} from './sentry-scrub';

if (process.env.SENTRY_DSN_SELLER_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_SELLER_WEB,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    sampleRate: 1.0,
    // Never attach the client IP. SDK default; pinned so a future
    // default change or a copy-paste cannot silently enable it.
    sendDefaultPii: false,
    beforeSend(event) {
      return sanitizeSentryEvent(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return sanitizeSentryBreadcrumb(breadcrumb);
    },
  });
}
