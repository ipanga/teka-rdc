/**
 * Shared Sentry payload scrubber. See apps/buyer-web/sentry-scrub.ts for the
 * full rationale — keep all three apps in sync if either changes.
 */
const PHONE_REGEX = /\+243\d{9}/g;

export function scrubPhones<T>(value: T): T {
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
