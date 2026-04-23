import { IsOptional, IsDateString, Matches } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'La date de début doit être au format ISO' })
  dateFrom?: string;

  @IsOptional()
  @IsDateString({}, { message: 'La date de fin doit être au format ISO' })
  dateTo?: string;

  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, { message: 'ID vendeur invalide' })
  sellerId?: string;
}
