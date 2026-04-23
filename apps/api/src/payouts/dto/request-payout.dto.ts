import { IsEnum, IsNotEmpty, Matches } from 'class-validator';

const PAYOUT_METHODS = ['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'] as const;

export class RequestPayoutDto {
  @IsEnum(PAYOUT_METHODS, {
    message:
      "La méthode de paiement doit être l'une des suivantes : M_PESA, AIRTEL_MONEY, ORANGE_MONEY",
  })
  @IsNotEmpty({ message: 'La méthode de paiement est requise' })
  payoutMethod: string;

  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le numéro de téléphone doit être au format +243XXXXXXXXX',
  })
  @IsNotEmpty({ message: 'Le numéro de téléphone est requis' })
  payoutPhone: string;
}
