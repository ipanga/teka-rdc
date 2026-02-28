import { IsString, IsOptional, MinLength, Matches } from 'class-validator';

export class UpdateSellerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  businessName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+243\d{9}$/, { message: 'Numéro de téléphone invalide' })
  phone?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
