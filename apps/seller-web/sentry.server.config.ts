// Sentry server (Node.js runtime) SDK bootstrap for seller-web.
// See apps/buyer-web/sentry.server.config.ts for the full rationale.
import * as Sentry from '@sentry/nextjs';
import { scrubPhones } from './sentry-scrub';

if (process.env.SENTRY_DSN_SELLER_WEB) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN_SELLER_WEB,
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
