import { IsNotEmpty, Matches } from 'class-validator';

/** Body for `POST /v1/checkout/quote` — preview fees for a chosen address. */
export class QuoteDto {
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'adresse de livraison est invalide",
  })
  @IsNotEmpty({ message: "L'adresse de livraison est requise" })
  deliveryAddressId: string;
}
