import { IsString, IsIn, IsOptional } from 'class-validator';

export class ReviewSellerDto {
  @IsString()
  @IsIn(['APPROVE', 'REJECT'], { message: 'Décision invalide' })
  decision: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
