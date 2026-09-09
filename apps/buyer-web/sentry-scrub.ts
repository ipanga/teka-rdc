/**
 * Sentry payload sanitisation for this app.
 *
 * Thin re-export of the canonical implementation in `@teka/shared`, which
 * is shared with the API and the other two web apps so the rule set cannot
 * drift between surfaces. The file is kept per-app because all three Sentry
 * runtime configs import from it by relative path.
 *
 * What it does and why: see the docblock on
 * `packages/shared/src/security/sentry-sanitize.ts`.
 */
export {
  sanitizeSentryEvent,
  sanitizeSentryBreadcrumb,
  scrubString,
  sanitizeUrl,
  FILTERED,
} from '@teka/shared';
