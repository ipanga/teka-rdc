// Sentry client (browser) SDK bootstrap for admin-web.
// See apps/buyer-web/instrumentation-client.ts for the full rationale.
import * as Sentry from '@sentry/nextjs';
import { scrubPhones } from './sentry-scrub';

if (process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
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
