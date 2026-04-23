import { IsString, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @MinLength(1, { message: 'Jeton Google requis' })
  idToken: string;
}
