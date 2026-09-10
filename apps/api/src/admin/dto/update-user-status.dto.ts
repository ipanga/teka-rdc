import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED', 'BANNED'], { message: 'Statut invalide' })
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'La raison ne peut pas dépasser 500 caractères' })
  reason?: string;
}
