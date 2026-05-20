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
 */
export class NotificationPrefsDto {
  /** Order lifecycle SMS: placed / confirmed / shipped / delivered / cancelled. */
  @IsOptional()
  @IsBoolean()
  smsOrderUpdates?: boolean;

  /** Admin SMS broadcasts (announcements, marketing). */
  @IsOptional()
  @IsBoolean()
  smsBroadcasts?: boolean;
}

/**
 * Effective (resolved) preferences with all defaults applied. Returned by
 * `GET /v1/users/notification-prefs` and produced by
 * `NotificationPrefsService.resolve(userId)`.
 */
export interface ResolvedNotificationPrefs {
  smsOrderUpdates: boolean;
  smsBroadcasts: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: ResolvedNotificationPrefs = {
  smsOrderUpdates: true,
  smsBroadcasts: true,
};
