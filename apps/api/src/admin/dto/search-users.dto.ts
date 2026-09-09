import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole, UserStatus } from '@prisma/client';

/**
 * S14 (2026-09-09): `role` and `status` were free strings cast straight into
 * Prisma enum filters, so a typo answered a 500 instead of a 400; paging was
 * unvalidated (the service clamped `limit`, but `page=NaN` still reached it).
 */
export class SearchUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un nombre entier' })
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un nombre entier' })
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'La recherche ne peut pas dépasser 200 caractères' })
  search?: string;

  @IsOptional()
  @IsIn(Object.values(UserRole), {
    message: `Le rôle doit être l'un des suivants : ${Object.values(UserRole).join(', ')}`,
  })
  role?: string;

  @IsOptional()
  @IsIn(Object.values(UserStatus), {
    message: `Le statut doit être l'un des suivants : ${Object.values(UserStatus).join(', ')}`,
  })
  status?: string;
}
