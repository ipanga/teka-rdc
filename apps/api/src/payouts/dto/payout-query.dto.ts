import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

const PAYOUT_STATUSES = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
] as const;

export class PayoutQueryDto {
  @IsOptional()
  @IsEnum(PAYOUT_STATUSES, {
    message:
      'Le statut doit être l\'un des suivants : REQUESTED, APPROVED, PROCESSING, COMPLETED, REJECTED',
  })
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un nombre entier' })
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un nombre entier' })
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(100, { message: 'La limite ne peut pas dépasser 100' })
  limit?: number;
}
