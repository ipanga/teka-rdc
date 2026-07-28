import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsIn,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class SpecificationDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Attribut invalide',
  })
  attributeId: string;

  @IsString()
  @IsNotEmpty({ message: 'La valeur est requise' })
  value: string;
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis' })
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'La description est requise' })
  description: string;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Catégorie invalide',
  })
  categoryId: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Ville invalide',
  })
  cityId?: string;

  // Optional first-class brand (D1). Hex-regex (not @IsUUID) so the seeded
  // brand ids (15000000-…) validate. Send null on update to clear the brand.
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Marque invalide',
  })
  brandId?: string | null;

  @IsString({ message: 'Le prix FC est requis' })
  priceCDF: string; // BigInt as string

  @IsOptional()
  @IsString()
  priceUSD?: string;

  // Optional seller-set promotional price (centimes, BigInt as string). Must be
  // > 0 and strictly < priceCDF — enforced in the service (cross-field). Send
  // null to clear the discount. The % is derived on display, never sent.
  @IsOptional()
  @Matches(/^\d+$/, { message: 'Prix promotionnel FC invalide' })
  discountPriceCDF?: string | null;

  @IsOptional()
  @Matches(/^\d+$/, { message: 'Prix promotionnel USD invalide' })
  discountPriceUSD?: string | null;

  @IsInt()
  @Min(0, { message: 'La quantité ne peut pas être négative' })
  @Type(() => Number)
  quantity: number;

  /**
   * DEPRECATED (2026-07-28) — Teka sells new products only and no seller UI
   * offers the choice. Now OPTIONAL and defaulted to NEW by the service, so a
   * client that stops sending it keeps working; still accepted (and still
   * validated) so existing callers are unaffected.
   * See docs/product-condition-deprecation.md.
   */
  @IsOptional()
  @IsIn(['NEW', 'USED'], { message: 'Condition invalide' })
  condition?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecificationDto)
  specifications?: SpecificationDto[];
}
