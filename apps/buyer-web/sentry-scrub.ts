/**
 * Shared Sentry payload scrubber.
 *
 * Imported by sentry.{client,server,edge}.config.ts. Buyer phone numbers
 * (+243XXXXXXXXX) are auth identifiers (Rule 13 in CLAUDE.md) — strip
 * them out of any event payload before sending to Sentry. Belt-and-suspenders
 * on top of Sentry's built-in scrubbers.
 *
 * Mirrors apps/api/src/instrument.ts:scrubPhones — keep in sync if either
 * changes. Don't try to share via @teka/shared; we'd be adding a workspace
 * dep just for a 10-line function, and the API uses different SDK types.
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
