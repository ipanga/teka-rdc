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
 */
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    // Sample 100% of errors. The DRC traffic volume is low enough that
    // this is fine and we don't want to lose signal to client-side
    // sampling. Revisit if/when error volume grows.
    sampleRate: 1.0,
  });
}
