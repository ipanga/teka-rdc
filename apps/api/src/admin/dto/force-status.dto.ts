import { IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class ForceStatusDto {
  @IsEnum(OrderStatus, {
    message: 'Le statut doit être une valeur valide de OrderStatus',
  })
  status: OrderStatus;

  @IsOptional()
  @IsString({ message: 'La note doit être une chaîne de caractères' })
  @MaxLength(500, { message: 'La note ne peut pas dépasser 500 caractères' })
  note?: string;
}
