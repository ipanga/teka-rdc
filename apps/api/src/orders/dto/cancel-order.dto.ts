import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsOptional()
  @IsString({ message: 'La raison doit être une chaîne de caractères' })
  @MaxLength(500, { message: 'La raison ne peut pas dépasser 500 caractères' })
  reason?: string;
}
