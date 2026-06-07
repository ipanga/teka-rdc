import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  Matches,
  IsIn,
} from 'class-validator';

export class ApplySellerDto {
  @IsString()
  @MinLength(2, {
    message: 'Le nom commercial doit contenir au moins 2 caractères',
  })
  businessName: string;

  @IsString()
  @IsIn(['individual', 'company'], { message: "Type d'entreprise invalide" })
  businessType: string;

  @IsString()
  @IsNotEmpty({ message: "Le numéro d'identification est requis" })
  idNumber: string;

  @IsString()
  @IsIn(['national_id', 'passport', 'rccm'], {
    message: "Type d'identifiant invalide",
  })
  idType: string;

  @IsString()
  @Matches(/^\+243\d{9}$/, {
    message: 'Numéro de téléphone invalide. Format: +243XXXXXXXXX',
  })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'La localisation est requise' })
  location: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Ville invalide',
  })
  cityId?: string;

  // Required: the seller's commune (sub-division of the city). The applicant
  // picks it from the communes of the chosen city; cityId is derived
  // server-side from this commune so the two always stay consistent.
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Commune invalide',
  })
  @IsNotEmpty({ message: 'La commune est requise' })
  communeId: string;

  @IsOptional()
  @IsString()
  description?: string;
}
