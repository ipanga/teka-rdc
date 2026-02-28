import { IsString, IsIn, IsOptional } from 'class-validator';

export class UpdateUserStatusDto {
  @IsString()
  @IsIn(['ACTIVE', 'SUSPENDED', 'BANNED'], { message: 'Statut invalide' })
  status: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
