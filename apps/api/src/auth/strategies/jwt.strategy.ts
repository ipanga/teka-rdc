import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildSurfaceOriginMap,
  cookieNamesFor,
  headerSurfaceHint,
  surfaceForRole,
  surfaceFromOrigin,
  type RequestWithAuthContext,
  type SurfaceOriginMap,
} from '../surface.util';

export interface JwtPayload {
  sub: string;
  role: string;
  phone: string | null;
  jti: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private static readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
  ) {
    const origins: SurfaceOriginMap = buildSurfaceOriginMap({
      adminWebUrl: configService.get<string>('ADMIN_WEB_URL'),
      sellerWebUrl: configService.get<string>('SELLER_WEB_URL'),
      buyerWebUrl: configService.get<string>('BUYER_WEB_URL'),
      corsOrigins: configService.get<string>('CORS_ORIGINS'),
    });
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Cookie path (web). D2a: the namespace that may be read is chosen
        // from the trusted request Origin, never from a client header. No
        // Origin, or an Origin that is not one of the configured web apps,
        // means no cookie is read at all — the request can still carry a
        // bearer token (mobile), which is the next extractor.
        (req: RequestWithAuthContext) => {
          const cookies = req?.cookies;
          if (!cookies) return null;
          const surface = surfaceFromOrigin(origins, req.headers?.origin);
          if (!surface) return null;
          const token = cookies[cookieNamesFor(surface).access];
          if (!token) return null;
          req.tekaAuth = { via: 'cookie', surface };
          const hint = headerSurfaceHint(req);
          if (hint && hint !== surface) {
            JwtStrategy.logger.warn(
              `X-Teka-Surface=${hint} disagrees with the request origin surface=${surface} — header ignored`,
            );
          }
          return token;
        },
        (req: RequestWithAuthContext) => {
          const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
          if (token) req.tekaAuth = { via: 'bearer', surface: null };
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
      passReqToCallback: true,
    });
  }

  async validate(req: RequestWithAuthContext, payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub, deletedAt: null },
    });

    if (!user) {
      throw new UnauthorizedException('Utilisateur non trouvé');
    }

    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new UnauthorizedException('Compte suspendu ou banni');
    }

    // D2a invariant: a session read from the `{surface}` cookie namespace
    // must belong to a role that lives in that namespace. Cookies are only
    // ever WRITTEN for `surfaceForRole(role)` (auth.controller), so a
    // mismatch here means a planted or replayed cookie — refuse it.
    const roleSurface = surfaceForRole(user.role);
    const ctx = req.tekaAuth;
    if (ctx?.via === 'cookie' && ctx.surface !== roleSurface) {
      JwtStrategy.logger.warn(
        `Cookie session for user ${user.id} (role=${user.role}) presented in the ${ctx.surface} namespace — refused`,
      );
      throw new UnauthorizedException('Session invalide pour cette interface');
    }

    return {
      userId: payload.sub,
      role: user.role,
      phone: user.phone,
      email: user.email,
      // `jti` is the RefreshToken.id of the session that issued this access
      // token (both tokens share the same tokenId at issue time — see
      // AuthService.generateTokens). Sessions endpoints read it to mark the
      // current device + reject self-revocation.
      jti: payload.jti,
      // Trusted surface of this session (pure function of the stored role):
      // controllers write / clear cookies for it, never for a client claim.
      surface: roleSurface,
      authVia: ctx?.via ?? 'bearer',
    };
  }
}
