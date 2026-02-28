import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { PromotionType, PromotionStatus } from '@prisma/client';

export class PromotionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La page doit être un nombre entier' })
  @Min(1, { message: 'La page doit être au minimum 1' })
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La limite doit être un nombre entier' })
  @Min(1, { message: 'La limite doit être au minimum 1' })
  @Max(50, { message: 'La limite ne peut pas dépasser 50' })
  limit?: number = 10;

  @IsOptional()
  @IsEnum(PromotionType, {
    message: 'Le type doit être PROMOTION ou FLASH_DEAL',
  })
  type?: PromotionType;

  @IsOptional()
  @IsEnum(PromotionStatus, {
    message:
      'Le statut doit être DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, ACTIVE, EXPIRED ou CANCELLED',
  })
  status?: PromotionStatus;
}
