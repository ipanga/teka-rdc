import { IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderQueryDto {
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number = 20;

  @IsOptional()
  @IsString({ message: 'Le statut doit être une chaîne de caractères' })
  status?: string;
}
