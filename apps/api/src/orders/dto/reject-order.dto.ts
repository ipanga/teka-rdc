import { IsString, MinLength, MaxLength } from 'class-validator';

export class RejectOrderDto {
  @IsString({
    message: 'La raison du rejet doit être une chaîne de caractères',
  })
  @MinLength(5, {
    message: 'La raison du rejet doit contenir au moins 5 caractères',
  })
  @MaxLength(500, {
    message: 'La raison du rejet ne peut pas dépasser 500 caractères',
  })
  reason: string;
}
