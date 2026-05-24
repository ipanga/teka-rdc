// Sentry server (Node.js runtime) SDK bootstrap.
//
// Reads SENTRY_DSN_BUYER_WEB from runtime env (not NEXT_PUBLIC_ — server-only).
// When unset, init is skipped. Loaded by instrumentation.ts.
import * as Sentry from '@sentry/nextjs';
import { scrubPhones } from './sentry-scrub';

if (process.env.SENTRY_DSN_BUYER_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_BUYER_WEB,
    environment:
      process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    sampleRate: 1.0,
    beforeSend(event) {
      return scrubPhones(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubPhones(breadcrumb);
    },
  });
}
