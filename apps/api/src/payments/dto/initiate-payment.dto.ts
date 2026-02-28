import { IsEnum, IsNotEmpty, IsUUID, Matches } from 'class-validator';

const MOBILE_MONEY_PROVIDERS = ['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'] as const;

export class InitiatePaymentDto {
  @IsUUID('4', { message: 'L\'ID de commande est invalide' })
  @IsNotEmpty({ message: 'L\'ID de commande est requis' })
  orderId: string;

  @IsEnum(MOBILE_MONEY_PROVIDERS, {
    message: 'L\'opérateur doit être l\'un des suivants : M_PESA, AIRTEL_MONEY, ORANGE_MONEY',
  })
  @IsNotEmpty({ message: 'L\'opérateur Mobile Money est requis' })
  mobileMoneyProvider: string;

  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le numéro de téléphone doit être au format +243XXXXXXXXX',
  })
  @IsNotEmpty({ message: 'Le numéro de téléphone est requis' })
  payerPhone: string;
}
