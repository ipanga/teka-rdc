import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SellerDocumentType } from '@prisma/client';

/** Multipart body next to the `document` file part. */
export class UploadSellerDocumentDto {
  @IsEnum(SellerDocumentType, { message: 'Type de document invalide' })
  type: SellerDocumentType;

  // Free description; required by the service when type = OTHER.
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Précisez le type de document (2 caractères minimum)' })
  @MaxLength(80, { message: 'Le libellé ne doit pas dépasser 80 caractères' })
  label?: string;
}
