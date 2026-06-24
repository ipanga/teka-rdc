import { IsString, MinLength, MaxLength } from 'class-validator';

export class SuspendProductDto {
  @IsString({
    message: 'La raison de la suspension doit être une chaîne de caractères',
  })
  @MinLength(5, {
    message: 'La raison de la suspension doit contenir au moins 5 caractères',
  })
  @MaxLength(500)
  reason: string;
}
