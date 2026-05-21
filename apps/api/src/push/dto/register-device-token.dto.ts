import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDeviceTokenDto {
  /**
   * FCM registration token. Long opaque string from the Flutter SDK
   * (~150–250 chars depending on platform). We don't enforce a hard
   * format because FCM has changed token shapes historically — just a
   * sanity length window.
   */
  @IsString()
  @MinLength(64)
  @MaxLength(512)
  token!: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: 'android' | 'ios' | 'web';

  /**
   * Free-form device descriptor — e.g. "Samsung Galaxy A14" on Android,
   * "iPhone 13 (iOS 18.2)" on iOS. Used for the future "Appareils
   * connectés" parity on the buyer side. Never sent in pushes.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceInfo?: string;

  /**
   * App version string from the client (e.g. "1.4.0+27"). Useful for
   * forensic queries when a push payload format changes.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;
}
