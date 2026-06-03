import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostHog } from 'posthog-node';

/**
 * Server-side PostHog wrapper. Mirrors the Sentry / Push no-op pattern:
 * if `POSTHOG_API_KEY` is unset (dev, CI, prod before the key is
 * provisioned), the client is never constructed and every `capture` /
 * `identify` is a no-op. Safe to merge before the key exists.
 *
 * Design rules (see tasks/posthog-rollout-progress.md):
 * - **Fire-and-forget.** Never `await` a capture in a request path — the
 *   node client batches + flushes async. Each method catches its own
 *   errors so callers never need a try/catch.
 * - **Server owns transactional events** (orders, auth, payments, admin)
 *   per the Event Ownership Matrix — clients own UI-intent events. Never
 *   emit the same event name from both layers.
 * - **`distinctId` is always the public `user.id`** so server + web +
 *   mobile events stitch to one PostHog person, and the client-side
 *   `identify(user.id)` merges the prior anonymous session.
 * - **Identity carries `id` + `role` only** — never phone, email, names,
 *   tokens (Rule 13). `before_send`-style phone scrubbing is applied to
 *   every event's properties as defence-in-depth.
 * - Every event is tagged with `environment` so dev/staging/prod stay
 *   filterable even if a key leaks across (single prod project, dev key
 *   left empty — Phase 7 decision).
 */

const PHONE_REGEX = /\+243\d{9}/g;

/**
 * Recursive scrubber mirroring `instrument.ts` — replace any DRC phone
 * number with `[phone]` in string values, walking arrays + objects.
 * Keep the regex in sync with the Sentry scrubber.
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

export type AnalyticsProperties = Record<string, unknown>;

@Injectable()
export class PostHogService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PostHogService.name);
  private client: PostHog | null = null;
  private environment = 'development';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiKey = this.config.get<string>('POSTHOG_API_KEY', '');
    this.environment =
      this.config.get<string>('SENTRY_ENVIRONMENT') ||
      this.config.get<string>('NODE_ENV') ||
      'development';

    if (!apiKey) {
      this.logger.warn(
        'PostHog disabled — POSTHOG_API_KEY not set. Server-side analytics ' +
          'are a no-op until the key is provisioned.',
      );
      return;
    }

    const host = this.config.get<string>(
      'POSTHOG_HOST',
      'https://us.i.posthog.com',
    );

    try {
      this.client = new PostHog(apiKey, {
        host,
        // Low-volume DRC traffic: flush promptly so events aren't stranded
        // if the process is short-lived, but still batched.
        flushAt: 20,
        flushInterval: 10_000,
      });
      this.logger.log(
        `PostHog initialized — host ${host}, env ${this.environment}`,
      );
    } catch (err) {
      this.logger.error(
        `PostHog init failed: ${(err as Error).message}. Analytics will be a no-op.`,
      );
      this.client = null;
    }
  }

  /**
   * Flush pending events on shutdown so nothing is lost when the
   * container stops. `shutdown()` flushes then closes.
   */
  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.shutdown();
    } catch (err) {
      this.logger.error(
        `PostHog shutdown flush failed: ${(err as Error).message}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.client !== null;
  }

  /**
   * Capture a server-side event. Fire-and-forget — scrubs phones, stamps
   * `environment`, swallows errors. `distinctId` must be the public
   * `user.id`.
   */
  capture(
    distinctId: string,
    event: string,
    properties: AnalyticsProperties = {},
  ): void {
    if (!this.client) return;
    try {
      this.client.capture({
        distinctId,
        event,
        properties: scrubPhones({
          ...properties,
          environment: this.environment,
        }),
      });
    } catch (err) {
      this.logger.error(
        `PostHog capture failed for "${event}": ${(err as Error).message}`,
      );
    }
  }

  /**
   * Associate person properties with a user. By convention pass `id` +
   * `role` only — never phone, email, or names. Scrubbed as defence.
   */
  identify(distinctId: string, properties: AnalyticsProperties = {}): void {
    if (!this.client) return;
    try {
      this.client.identify({
        distinctId,
        properties: scrubPhones({
          ...properties,
          environment: this.environment,
        }),
      });
    } catch (err) {
      this.logger.error(
        `PostHog identify failed for "${distinctId}": ${(err as Error).message}`,
      );
    }
  }
}
