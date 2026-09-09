// Sentry client (browser) SDK bootstrap.
//
// Renamed from sentry.client.config.ts (deprecated in @sentry/nextjs 10.x)
// to instrumentation-client.ts — Next.js 15's standard hook location for
// client-side instrumentation, required for Turbopack compatibility.
//
// Reads NEXT_PUBLIC_SENTRY_DSN_BUYER_WEB at build time (inlined into the
// client bundle by Next.js). When unset, init is skipped — every captureException
// downstream becomes a no-op. Same pattern as apps/api/src/instrument.ts.
import * as Sentry from '@sentry/nextjs';
import {
  sanitizeSentryEvent,
  sanitizeSentryBreadcrumb,
} from './sentry-scrub';

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
