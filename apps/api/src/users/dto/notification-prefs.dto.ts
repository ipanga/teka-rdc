import { IsBoolean, IsOptional } from 'class-validator';

/**
 * User-configurable opt-out for non-transactional notifications.
 *
 * Stored as a JSON column on `User.notificationPrefs`. NULL means "all on"
 * (backward-compatible for rows added before this column existed). Defaults
 * are mirrored in `NotificationPrefsService.resolve()`.
 *
 * Transactional sends (OTP, password reset, email verify) are NEVER
 * opt-out-able and ignore this DTO entirely.
 *
 * The `smsBroadcasts` field was retired 2026-05-26 (PR C2) along with the
 * SMS broadcast branch. Legacy clients sending it get the field silently
 * ignored; legacy stored values are not consulted.
 */
export class NotificationPrefsDto {
  /**
   * Order lifecycle notifications: placed / confirmed / shipped / delivered
   * / cancelled. Name carries the legacy `sms` prefix for storage-format
   * back-compat with rows written before the channel split; the gate now
   * controls push + email-fallback (no SMS exists).
   */
  @IsOptional()
  @IsBoolean()
  smsOrderUpdates?: boolean;

  /** Admin push broadcasts (announcements, marketing). */
  @IsOptional()
  @IsBoolean()
  pushBroadcasts?: boolean;

  /** Admin email broadcasts (announcements, marketing). */
  @IsOptional()
  @IsBoolean()
  emailBroadcasts?: boolean;
}

/**
 * Effective (resolved) preferences with all defaults applied. Returned by
 * `GET /v1/users/notification-prefs` and produced by
 * `NotificationPrefsService.resolve(userId)`.
 */
export interface ResolvedNotificationPrefs {
  smsOrderUpdates: boolean;
  pushBroadcasts: boolean;
  emailBroadcasts: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: ResolvedNotificationPrefs = {
  smsOrderUpdates: true,
  pushBroadcasts: true,
  emailBroadcasts: true,
};
