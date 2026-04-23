import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
Matches, } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CheckoutDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'L\'adresse de livraison est invalide' })
  @IsNotEmpty({ message: 'L\'adresse de livraison est requise' })
  deliveryAddressId: string;

  @IsEnum(PaymentMethod, {
    message: `Le mode de paiement doit être l'un des suivants : ${Object.values(PaymentMethod).join(', ')}`,
  })
  @IsNotEmpty({ message: 'Le mode de paiement est requis' })
  paymentMethod: PaymentMethod;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'La clé d\'idempotence doit être un UUID valide' })
  @IsNotEmpty({ message: 'La clé d\'idempotence est requise' })
  idempotencyKey: string;

  @IsOptional()
  @IsString({ message: 'La note doit être une chaîne de caractères' })
  @MaxLength(500, { message: 'La note ne peut pas dépasser 500 caractères' })
  buyerNote?: string;

  @ValidateIf((o) => o.paymentMethod === 'MOBILE_MONEY')
  @IsEnum(['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'], {
    message: 'L\'opérateur doit être M_PESA, AIRTEL_MONEY ou ORANGE_MONEY',
  })
  @IsNotEmpty({ message: 'L\'opérateur Mobile Money est requis' })
  mobileMoneyProvider?: string;

  @ValidateIf((o) => o.paymentMethod === 'MOBILE_MONEY')
  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le numéro Mobile Money doit être au format +243XXXXXXXXX',
  })
  @IsNotEmpty({ message: 'Le numéro Mobile Money est requis' })
  payerPhone?: string;
}
