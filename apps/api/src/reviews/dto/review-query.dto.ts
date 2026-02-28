import { IsOptional, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReviewSortOption {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  HIGHEST = 'highest',
  LOWEST = 'lowest',
}

export class ReviewQueryDto {
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
  @Type(() => Number)
  @IsInt({ message: 'La note doit être un nombre entier' })
  @Min(1, { message: 'La note minimum est 1' })
  @Max(5, { message: 'La note maximum est 5' })
  rating?: number;

  @IsOptional()
  @IsEnum(ReviewSortOption, {
    message: 'Le tri doit être: newest, oldest, highest ou lowest',
  })
  sort?: ReviewSortOption = ReviewSortOption.NEWEST;
}
