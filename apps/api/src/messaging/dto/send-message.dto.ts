import {
  IsOptional,
  IsUUID,
  IsString,
  MinLength,
  MaxLength,
  ValidateIf,
  IsDefined,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsUUID('4', { message: "L'identifiant de la conversation doit être un UUID valide" })
  conversationId?: string;

  @ValidateIf((o) => !o.conversationId)
  @IsDefined({
    message: 'Vous devez fournir soit conversationId soit sellerId',
  })
  @IsUUID('4', { message: "L'identifiant du vendeur doit être un UUID valide" })
  sellerId?: string;

  @IsString({ message: 'Le contenu doit être une chaîne de caractères' })
  @MinLength(1, { message: 'Le message ne peut pas être vide' })
  @MaxLength(2000, { message: 'Le message ne peut pas dépasser 2000 caractères' })
  content: string;
}
