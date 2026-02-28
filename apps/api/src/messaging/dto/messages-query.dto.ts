import { IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class MessagesQueryDto {
  @IsOptional()
  @IsUUID('4', { message: "L'identifiant du curseur doit être un UUID valide" })
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un nombre entier' })
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number = 30;
}
