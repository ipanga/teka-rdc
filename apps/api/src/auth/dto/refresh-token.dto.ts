import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RefreshTokenDto {
  // OPTIONAL on purpose. The web clients authenticate the refresh via the
  // HttpOnly refresh-token COOKIE and POST an empty `{}` body — the controller
  // falls back to `req.cookies` when this field is absent. Mobile (no cookies)
  // sends the token in the body. Marking it required made the global
  // ValidationPipe 400 every cookie-based `{}` refresh BEFORE the handler ran,
  // so web auto-refresh silently failed and users were logged out the moment
  // their 15-min access token expired mid-session. When present it must still
  // be a non-empty string.
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Token de rafraîchissement requis' })
  refreshToken?: string;
}
