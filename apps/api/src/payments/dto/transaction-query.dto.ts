import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class TransactionQueryDto {
  @IsOptional()
  @IsEnum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'], {
    message: 'Statut invalide',
  })
  status?: string;

  @IsOptional()
  @IsEnum(['PAYMENT', 'REFUND', 'PAYOUT'], { message: 'Type invalide' })
  type?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID de commande invalide' })
  orderId?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date de début invalide' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date de fin invalide' })
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
