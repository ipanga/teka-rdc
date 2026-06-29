import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class RequestReturnDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif du retour est requis' })
  @MaxLength(500)
  reason!: string;
}
