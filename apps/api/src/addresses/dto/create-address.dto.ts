import {
  MaxLength,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Matches,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizeDrcPhone } from '@teka/shared';

/**
 * null / blank → null (clears on edit, "not provided" on create; `@IsOptional`
 * then skips validation); a recognised DRC number → canonical; anything else
 * → the trimmed input, so validation fails with the French message instead of
 * silently storing garbage or silently dropping the value.
 */
export function normalizeRecipientPhone(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return value as never;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return normalizeDrcPhone(trimmed) ?? trimmed;
}

export class CreateAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60, { message: 'Le libellé ne peut pas dépasser 60 caractères' })
  label?: string;

  @IsString()
  @IsNotEmpty({ message: 'La province est requise' })
  @MaxLength(80, { message: 'La province ne peut pas dépasser 80 caractères' })
  province: string;

  @IsString()
  @IsNotEmpty({ message: 'La ville est requise' })
  @MaxLength(80, { message: 'La ville ne peut pas dépasser 80 caractères' })
  town: string;

  @IsString()
  @IsNotEmpty({ message: 'Le quartier/commune est requis' })
  @MaxLength(80, { message: 'Le quartier/commune ne peut pas dépasser 80 caractères' })
  neighborhood: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Ville invalide',
  })
  cityId?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Commune invalide',
  })
  communeId?: string;

  @IsOptional()
  @IsString()
  avenue?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  /**
   * Stored in ONE canonical form, `+243XXXXXXXXX` (PR D2, 2026-09-07).
   *
   * The transform runs before validation: `081…`, `+243 81…`, `00243-81…`,
   * spaces and dashes all become the same value; blank clears the field
   * (null); anything that is not a DRC mobile number is left as typed so the
   * pattern check below rejects it with the French message. The clients
   * normalise too (shared helper), but the server is the rule.
   */
  @IsOptional()
  @Transform(({ value }) => normalizeRecipientPhone(value))
  @IsString()
  @Matches(/^\+243\d{9}$/, {
    message: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  })
  recipientPhone?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
