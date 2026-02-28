import { IsString, MinLength } from 'class-validator';

export class RejectProductDto {
  @IsString({ message: 'La raison du rejet doit être une chaîne de caractères' })
  @MinLength(5, { message: 'La raison du rejet doit contenir au moins 5 caractères' })
  rejectionReason: string;
}
