import { IsOptional, IsDateString, IsUUID } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'La date de début doit être au format ISO' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être au format ISO' })
  dateTo?: string;

  @IsOptional()
  @IsUUID('4', { message: 'ID vendeur invalide' })
  sellerId?: string;
}
