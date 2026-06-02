/**
 * PostHog event sanitizer.
 *
 * Used as posthog-js `before_send`. Buyer phone numbers (+243XXXXXXXXX) are
 * auth identifiers (Rule 13 in CLAUDE.md) — strip them from every captured
 * event before it leaves the browser, the same way sentry-scrub.ts does for
 * Sentry. Belt-and-suspenders on top of session-replay input masking.
 *
 * Mirrors apps/buyer-web/sentry-scrub.ts:scrubPhones — keep the regex in sync
 * if either changes. Not shared via @teka/shared: it's a ~10-line function and
 * the two SDKs have different payload types.
 */
import type { CaptureResult } from 'posthog-js';

const PHONE_REGEX = /\+243\d{9}/g;

function scrubValue<T>(value: T): T {
  if (typeof value === 'string') {
    return value.replace(PHONE_REGEX, '[phone]') as T;
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue) as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubValue(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Scrub phone numbers from a captured event's properties (incl. $current_url,
 * $referrer, autocaptured text). Returning the event sends it; returning null
 * would drop it — we always send, just sanitized.
 */
export function scrubPosthogEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  if (event.properties) {
    event.properties = scrubValue(event.properties);
  }
  return event;
}
