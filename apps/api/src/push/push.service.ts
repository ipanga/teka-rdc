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

/**
 * Two supported authentication shapes — pick whichever fits your
 * secret-injection workflow:
 *
 *   1. `GOOGLE_APPLICATION_CREDENTIALS` (path to a service-account JSON
 *      file). Standard Google SDK convention. Best when the file can be
 *      mounted into the container at a known path.
 *
 *   2. Discrete env vars: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`,
 *      `FIREBASE_CLIENT_EMAIL`. GitHub-Secrets-friendly — no file
 *      mounting needed; the deploy workflow just sets three env vars.
 *      `FIREBASE_PRIVATE_KEY` typically arrives with literal `\n`
 *      sequences (env-file or compose passing rarely unescapes them);
 *      we normalize before handing to firebase-admin.
 *
 * If neither shape is configured, init is skipped and every
 * `sendToUser` is a no-op. Safe to merge before credentials exist.
 */
const GAC_ENV = 'GOOGLE_APPLICATION_CREDENTIALS';
const FIREBASE_PROJECT_ID_ENV = 'FIREBASE_PROJECT_ID';
const FIREBASE_PRIVATE_KEY_ENV = 'FIREBASE_PRIVATE_KEY';
const FIREBASE_CLIENT_EMAIL_ENV = 'FIREBASE_CLIENT_EMAIL';

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
    const credential = this.resolveCredential();
    if (credential === null) {
      this.logger.warn(
        'Push notifications disabled — neither GOOGLE_APPLICATION_CREDENTIALS ' +
          'nor the discrete FIREBASE_* env trio is set. Set one of the two ' +
          'patterns to enable push.',
      );
      return;
    }

    if (admin.apps.length === 0) {
      try {
        this.app = admin.initializeApp({ credential });
        this.logger.log(
          `firebase-admin initialized — project ${(this.app.options.credential as any)?.projectId ?? 'unknown'}`,
        );
      } catch (err) {
        // Bad credential is loud, not silent. Same philosophy as the
        // production cookie-domain boot guard.
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

  /**
   * Tries the discrete-env-var shape first (more explicit, fewer
   * deploy-time moving parts), falls back to the GAC path shape.
   * Returns null if neither is configured.
   */
  private resolveCredential(): admin.credential.Credential | null {
    const projectId = process.env[FIREBASE_PROJECT_ID_ENV];
    const rawKey = process.env[FIREBASE_PRIVATE_KEY_ENV];
    const clientEmail = process.env[FIREBASE_CLIENT_EMAIL_ENV];

    if (projectId && rawKey && clientEmail) {
      // env-file loaders disagree on `\n` handling. Node 22's
      // `--env-file` unescapes inside double-quoted values; Docker
      // Compose `env_file:` and the GitHub Actions `env:` mapping do
      // not. Replace literal backslash-n with real newlines either
      // way — a no-op when newlines are already real.
      const privateKey = rawKey.replace(/\\n/g, '\n');
      return admin.credential.cert({ projectId, privateKey, clientEmail });
    }

    if (process.env[GAC_ENV]) {
      return admin.credential.applicationDefault();
    }

    return null;
  }

  isEnabled(): boolean {
    return this.app !== null;
  }

  /**
   * Fire-and-forget: catches every error internally, returns the
   * delivery summary for observability. Callers in notification flows
   * never need a try/catch around this.
   */
  async sendToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<{
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
        if (
          !r.success &&
          r.error &&
          INVALID_TOKEN_ERROR_CODES.has(r.error.code)
        ) {
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
