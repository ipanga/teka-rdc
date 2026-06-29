import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
