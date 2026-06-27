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
 * - `beforeSend` scrubs `+243XXXXXXXXX` phone numbers from event payloads
 *   before send. Phones are auth identifiers for buyers (Rule 13 in
 *   CLAUDE.md) and shouldn't end up in Sentry breadcrumbs / URLs / extras.
 */
import * as Sentry from '@sentry/node';

const PHONE_REGEX = /\+243\d{9}/g;

/**
 * Recursive scrubber: walk the event payload and replace any DRC phone
 * number with `[phone]`. Targets strings inside breadcrumbs, request URLs,
 * extras, tags — everywhere the SDK might serialize user input. Object
 * keys are left alone (Sentry's structure), only string VALUES are
 * touched.
 */
function scrubPhones<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(PHONE_REGEX, '[phone]') as T;
  }
  if (Array.isArray(value)) {
    return value.map(scrubPhones) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubPhones(v);
    }
    return out as T;
  }
  return value;
}

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
    beforeSend(event) {
      return scrubPhones(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubPhones(breadcrumb);
    },
  });
}
