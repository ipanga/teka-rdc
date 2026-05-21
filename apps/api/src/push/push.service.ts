import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Lean wrapper around firebase-admin. Mirrors the Sentry no-op pattern:
 * if `GOOGLE_APPLICATION_CREDENTIALS` is unset, init is skipped and
 * every `sendToUser*` call short-circuits to a no-op. Safe to merge
 * before the credential file exists on the host.
 *
 * Fan-out strategy: one Firebase multicast send per call, then any
 * tokens FCM reports as invalid get marked `isActive=false` (kept in
 * the table for forensic purposes, not deleted). Future sends skip
 * them via the `isActive=true` index.
 */
export interface PushPayload {
  title: string;
  body: string;
  /**
   * Free-form key/value payload delivered to the client as part of the
   * notification. Used by the Flutter app for tap-navigation routing
   * (e.g. `{ screen: 'order-details', orderId: '...' }`).
   *
   * FCM requires all data-payload values to be strings. We cast eagerly
   * in `toFcmMessage` so callers can pass numbers/booleans without
   * worrying about the wire format.
   */
  data?: Record<string, string | number | boolean | undefined>;
}

const ENABLE_ENV = 'GOOGLE_APPLICATION_CREDENTIALS';

/**
 * Errors FCM returns when a token is no longer valid. We dedupe these
 * codes against the same constants in `firebase-admin/messaging` rather
 * than hardcoding strings — the SDK is the source of truth.
 */
const INVALID_TOKEN_ERROR_CODES = new Set<string>([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app: admin.app.App | null = null;

  constructor(private prisma: PrismaService) {}

  onModuleInit(): void {
    if (!process.env[ENABLE_ENV]) {
      this.logger.warn(
        `${ENABLE_ENV} not set — push notifications are a no-op. ` +
          'Set the env var to a Firebase Admin SDK service-account JSON path to enable.',
      );
      return;
    }
    if (admin.apps.length === 0) {
      try {
        this.app = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
        this.logger.log(
          `firebase-admin initialized — project ${(this.app.options.credential as any)?.projectId ?? 'unknown'}`,
        );
      } catch (err) {
        // Bad credential file is loud, not silent. Same philosophy as
        // the production cookie-domain boot guard.
        this.logger.error(
          `firebase-admin init failed: ${(err as Error).message}. ` +
            'Push notifications will be a no-op until this is fixed.',
        );
        this.app = null;
      }
    } else {
      this.app = admin.app();
    }
  }

  isEnabled(): boolean {
    return this.app !== null;
  }

  /**
   * Fire-and-forget: catches every error internally, returns the
   * delivery summary for observability. Callers in notification flows
   * never need a try/catch around this.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<{
    enabled: boolean;
    tokens: number;
    succeeded: number;
    invalidated: number;
  }> {
    if (!this.isEnabled()) {
      return { enabled: false, tokens: 0, succeeded: 0, invalidated: 0 };
    }

    let rows: Array<{ id: string; token: string }>;
    try {
      rows = await this.prisma.deviceToken.findMany({
        where: { userId, isActive: true },
        select: { id: true, token: true },
      });
    } catch (err) {
      this.logger.error(
        `device-token lookup failed for user ${userId}: ${(err as Error).message}`,
      );
      return { enabled: true, tokens: 0, succeeded: 0, invalidated: 0 };
    }

    if (rows.length === 0) {
      return { enabled: true, tokens: 0, succeeded: 0, invalidated: 0 };
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        notification: { title: payload.title, body: payload.body },
        data: this.serializeData(payload.data),
        tokens: rows.map((r) => r.token),
      });

      const invalidIds: string[] = [];
      response.responses.forEach((r, i) => {
        if (!r.success && r.error && INVALID_TOKEN_ERROR_CODES.has(r.error.code)) {
          invalidIds.push(rows[i].id);
        }
      });

      if (invalidIds.length > 0) {
        await this.prisma.deviceToken.updateMany({
          where: { id: { in: invalidIds } },
          data: { isActive: false },
        });
      }

      return {
        enabled: true,
        tokens: rows.length,
        succeeded: response.successCount,
        invalidated: invalidIds.length,
      };
    } catch (err) {
      this.logger.error(
        `multicast send failed for user ${userId}: ${(err as Error).message}`,
      );
      return {
        enabled: true,
        tokens: rows.length,
        succeeded: 0,
        invalidated: 0,
      };
    }
  }

  private serializeData(
    data?: Record<string, string | number | boolean | undefined>,
  ): Record<string, string> {
    if (!data) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) out[k] = String(v);
    }
    return out;
  }
}
