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

  // The seller's commune (sub-division of the city), picked from
  // GET /v1/cities/:id/communes. Required by the service whenever the chosen
  // city has an active commune library; optional only for cities that have
  // no authoritative commune data yet (D2/D4). When present, cityId is derived
  // server-side from the commune so the two always stay consistent.
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Commune invalide',
  })
  communeId?: string;

  // Required: the Cloudinary public_id of the uploaded ID/RCCM photo, returned
  // by POST /v1/sellers/documents. Constrained to our private documents folder
  // so a client can't point the application at an arbitrary asset.
  @Matches(/^teka-rdc\/seller-documents\//, {
    message: "Document d'identité invalide",
  })
  @IsNotEmpty({ message: "La pièce d'identité est requise" })
  idDocumentCloudinaryId: string;

  @IsOptional()
  @IsString()
  description?: string;
}
