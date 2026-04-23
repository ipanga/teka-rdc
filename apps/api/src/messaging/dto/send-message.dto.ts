import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  ValidateIf,
  IsDefined,
  Matches,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'identifiant de la conversation doit être un UUID valide",
  })
  conversationId?: string;

  @ValidateIf((o) => !o.conversationId)
  @IsDefined({
    message: 'Vous devez fournir soit conversationId soit sellerId',
  })
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: "L'identifiant du vendeur doit être un UUID valide",
  })
  sellerId?: string;

  @IsString({ message: 'Le contenu doit être une chaîne de caractères' })
  @MinLength(1, { message: 'Le message ne peut pas être vide' })
  @MaxLength(2000, {
    message: 'Le message ne peut pas dépasser 2000 caractères',
  })
  content: string;
}
