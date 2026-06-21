import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

/**
 * Set the authenticated buyer's preferred delivery town
 * (Town Architecture Refactor). `cityId: null` clears the preference.
 */
export class PreferredCityDto {
  // Allow an explicit null to clear; otherwise must be a UUID.
  @ValidateIf((o) => o.cityId !== null)
  @IsOptional()
  @IsUUID()
  cityId!: string | null;
}
