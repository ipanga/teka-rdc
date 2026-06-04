import { Global, Module } from '@nestjs/common';
import { PostHogService } from './posthog.service';

/**
 * Server-side analytics (PostHog). `@Global` so any service can inject
 * `PostHogService` without re-importing the module — analytics is a
 * cross-cutting concern touched from auth, orders, payments, admin, etc.
 * (mirrors how the gated PushService is consumed across modules).
 *
 * The service is inert when `POSTHOG_API_KEY` is empty, so importing this
 * module everywhere is safe in dev / CI / pre-provisioning prod.
 */
@Global()
@Module({
  providers: [PostHogService],
  exports: [PostHogService],
})
export class AnalyticsModule {}
