import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * Checkout accepts only Cash-on-Delivery since 2026-05-26 (PR B2 of the
 * Orange/AT/Flexpay removal initiative). Legacy mobile builds that POST
 * `MOBILE_MONEY` get a clean French BadRequest from class-validator
 * (graceful degradation — buyer is prompted to update the app).
 *
 * The Prisma `PaymentMethod` enum still carries `MOBILE_MONEY` so legacy
 * Order rows continue to type-check on the read side; the DTO simply
 * narrows the accepted input to the live set.
 */
const ACCEPTED_PAYMENT_METHODS = ['COD'] as const;
type AcceptedPaymentMethod = (typeof ACCEPTED_PAYMENT_METHODS)[number];

export class CheckoutDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'adresse de livraison est invalide",
  })
  @IsNotEmpty({ message: "L'adresse de livraison est requise" })
  deliveryAddressId: string;

  @IsEnum(ACCEPTED_PAYMENT_METHODS, {
    message:
      "Seul le paiement à la livraison est accepté. Merci de mettre à jour l'application.",
  })
  @IsNotEmpty({ message: 'Le mode de paiement est requis' })
  paymentMethod: AcceptedPaymentMethod;

  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "La clé d'idempotence doit être un UUID valide",
  })
  @IsNotEmpty({ message: "La clé d'idempotence est requise" })
  idempotencyKey: string;

  @IsOptional()
  @IsString({ message: 'La note doit être une chaîne de caractères' })
  @MaxLength(500, { message: 'La note ne peut pas dépasser 500 caractères' })
  buyerNote?: string;
}
