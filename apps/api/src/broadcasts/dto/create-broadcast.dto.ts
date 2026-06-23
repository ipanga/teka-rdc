import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsIn,
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';

export const BROADCAST_SEGMENTS = [
  'ALL_BUYERS',
  'ALL_SELLERS',
  'ALL_USERS',
] as const;

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number];

/**
 * Per-broadcast channel toggles. When omitted, the service uses
 * BROADCAST_DEFAULT_CHANNELS (push + email). Stored as JSON on
 * NotificationBroadcast.channels.
 *
 * The `sms` field was removed 2026-05-26 (PR C2 of the Orange/AT/Flexpay
 * removal initiative). Legacy clients sending `sms: true|false` get the
 * field silently dropped at the validation layer.
 */
export class BroadcastChannelsDto {
  @IsOptional()
  @IsBoolean()
  push?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;
}

export class CreateBroadcastDto {
  @IsString({ message: 'Le titre est requis' })
  @IsNotEmpty({ message: 'Le titre ne peut pas être vide' })
  @MaxLength(100, { message: 'Le titre ne peut pas dépasser 100 caractères' })
  title: string;

  // Length cap relaxed from 160 → 500 chars on 2026-05-26 (PR C2). The
  // 160 limit was the SMS segment ceiling; with the SMS branch deleted,
  // FCM (~250-byte body, but renders longer in expanded notifications)
  // and Resend (no practical limit) easily handle 500.
  @IsString({ message: 'Le message est requis' })
  @IsNotEmpty({ message: 'Le message ne peut pas être vide' })
  @MaxLength(500, {
    message: 'Le message ne peut pas dépasser 500 caractères',
  })
  message: string;

  @IsString({ message: 'Le segment est requis' })
  @IsIn(BROADCAST_SEGMENTS, {
    message: 'Le segment doit être ALL_BUYERS, ALL_SELLERS ou ALL_USERS',
  })
  segment: BroadcastSegment;

  @IsOptional()
  @ValidateNested()
  @Type(() => BroadcastChannelsDto)
  channels?: BroadcastChannelsDto;

  // "Specific buyers" mode: explicit recipient user ids. When present the
  // service targets exactly these (validated to be ACTIVE BUYERs) and ignores
  // `segment`. Lenient here (bounded string array); the service is strict.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000, { message: 'Trop de destinataires (max 1000)' })
  @IsString({ each: true })
  recipientIds?: string[];

  // Optional linked product → the broadcast becomes a product promo and
  // deep-links to the PDP. Validated by DB lookup in the service (seeded ids
  // are non-RFC4122, so no @IsUUID here).
  @IsOptional()
  @IsString()
  productId?: string;
}
