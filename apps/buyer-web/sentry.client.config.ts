// Sentry client (browser) SDK bootstrap.
//
// Reads NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB at build time (inlined into the
// client bundle by Next.js). When unset, init is skipped — every captureException
// downstream becomes a no-op. Same pattern as apps/api/src/instrument.ts.
//
// The build-arg flow for NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB is wired in PR 4
// (CI source maps + release tagging). Until then this file is dormant in prod.
import * as Sentry from '@sentry/nextjs';
import { scrubPhones } from './sentry-scrub';

if (process.env.NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB,
    environment:
      process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ??
      process.env.NODE_ENV ??
      'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    // Errors-only — match apps/api/src/instrument.ts. Revisit when there's a
    // specific question to answer about frontend perf.
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
