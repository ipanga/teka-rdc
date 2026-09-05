import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Admin reason/note. Required by the service for reject and revoke (D8),
 * optional for approve. Stored on the profile (`verificationNote`), the
 * rejected documents and the audit row.
 */
export class ReviewVerificationDto {
  @IsOptional()
  @IsString()
  @MinLength(5, { message: 'La raison doit contenir au moins 5 caractères' })
  @MaxLength(500, { message: 'La raison ne doit pas dépasser 500 caractères' })
  reason?: string;
}
