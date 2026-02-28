import { IsString, Matches, Length, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Matches(/^\+243\d{9}$/, {
    message: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  })
  phone: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code: string;

  @IsString()
  @MinLength(2, { message: 'Le prénom doit contenir au moins 2 caractères' })
  @MaxLength(50)
  firstName: string;

  @IsString()
  @MinLength(2, { message: 'Le nom doit contenir au moins 2 caractères' })
  @MaxLength(50)
  lastName: string;

  @IsOptional()
  @IsString()
  @IsIn(['fr', 'en'])
  locale?: string;
}
