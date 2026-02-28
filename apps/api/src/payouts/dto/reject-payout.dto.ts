import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RejectPayoutDto {
  @IsString({ message: 'La raison doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'La raison du rejet est requise' })
  @MinLength(1, { message: 'La raison du rejet est requise' })
  reason: string;
}
