import { IsString, IsNotEmpty, MaxLength, IsIn } from 'class-validator';

export const BROADCAST_SEGMENTS = [
  'ALL_BUYERS',
  'ALL_SELLERS',
  'ALL_USERS',
] as const;

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number];

export class CreateBroadcastDto {
  @IsString({ message: 'Le titre est requis' })
  @IsNotEmpty({ message: 'Le titre ne peut pas être vide' })
  @MaxLength(100, { message: 'Le titre ne peut pas dépasser 100 caractères' })
  title: string;

  @IsString({ message: 'Le message est requis' })
  @IsNotEmpty({ message: 'Le message ne peut pas être vide' })
  @MaxLength(160, {
    message: 'Le message ne peut pas dépasser 160 caractères (limite SMS)',
  })
  message: string;

  @IsString({ message: 'Le segment est requis' })
  @IsIn(BROADCAST_SEGMENTS, {
    message: 'Le segment doit être ALL_BUYERS, ALL_SELLERS ou ALL_USERS',
  })
  segment: BroadcastSegment;
}
