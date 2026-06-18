import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  Ip,
  BadRequestException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { BuyerOtpService } from './buyer-otp.service';
import { BuyerClaimService } from './buyer-claim.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordChangeDto } from './dto/password-change.dto';
import { BuyerOtpRequestDto } from './dto/buyer-otp-request.dto';
import { BuyerOtpVerifyDto } from './dto/buyer-otp-verify.dto';
import { BuyerOtpResendDto } from './dto/buyer-otp-resend.dto';
import { BuyerClaimRequestDto } from './dto/buyer-claim-request.dto';
import { BuyerClaimVerifyDto } from './dto/buyer-claim-verify.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  resolveSurface,
  cookieNamesFor,
  type AuthSurface,
} from './surface.util';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private buyerOtpService: BuyerOtpService,
    private buyerClaimService: BuyerClaimService,
    private configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Email + password registration (sellers + admins only since 2026-05-15).
  // Buyers authenticate via WhatsApp OTP (see buyer/otp/* below). Role is
  // server-assigned (never trust the client). /register/email creates SELLER.
  // Admins are seeded out-of-band — there is no admin register endpoint.
  // ---------------------------------------------------------------------------

  @Public()
  @Post('register/email')
  async registerSeller(
    @Body() dto: EmailRegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerSellerWithEmail(
      dto,
      this.extractDevice(req),
    );
    this.setAuthCookies(res, result.tokens, resolveSurface(req));
    return result;
  }

  @Public()
  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  async loginWithEmail(
    @Body() dto: EmailLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithEmail(
      dto,
      this.extractDevice(req),
    );
    this.setAuthCookies(res, result.tokens, resolveSurface(req));
    return result;
  }

  @Public()
  @Post('password-reset/request')
  @HttpCode(HttpStatus.OK)
  async requestPasswordReset(
    @Body() dto: PasswordResetRequestDto,
    @Ip() ip: string,
  ) {
    return this.authService.requestPasswordReset(dto, ip);
  }

  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.authService.confirmPasswordReset(dto);
  }

  /**
   * In-app password change for an authenticated user. Sellers + admins.
   * Authentication is the default global JwtAuthGuard — no @Public/@Roles
   * needed; any logged-in user can hit this. Service layer rejects buyers
   * (no password, WhatsApp OTP since 2026-05-15) with a 400.
   */
  @Post('password/change')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser('userId') userId: string,
    @Body() dto: PasswordChangeDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  // ---------------------------------------------------------------------------
  // Buyer WhatsApp OTP — primary buyer auth surface since 2026-05-15.
  // Replaces the previous /register/buyer + /buyer/migrate-* endpoints.
  // ---------------------------------------------------------------------------

  @Public()
  @Post('buyer/otp/request')
  @HttpCode(HttpStatus.OK)
  async buyerOtpRequest(@Body() dto: BuyerOtpRequestDto) {
    return this.buyerOtpService.requestOtp(dto.phone);
  }

  @Public()
  @Post('buyer/otp/verify')
  @HttpCode(HttpStatus.OK)
  async buyerOtpVerify(
    @Body() dto: BuyerOtpVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.buyerOtpService.verifyOtp(
      dto.phone,
      dto.code,
      dto.firstName,
      dto.lastName,
      this.extractDevice(req),
    );
    this.setAuthCookies(res, result.tokens, resolveSurface(req));
    return result;
  }

  @Public()
  @Post('buyer/otp/resend')
  @HttpCode(HttpStatus.OK)
  async buyerOtpResend(@Body() dto: BuyerOtpResendDto) {
    return this.buyerOtpService.resendOtp(dto.phone);
  }

  // ---------------------------------------------------------------------------
  // Buyer claim flow — for the ~3-day cohort that registered with
  // email+password between 2026-05-12 and 2026-05-15 and therefore has no
  // phone on file. Two-step: email lookup + magic link → phone + OTP.
  // ---------------------------------------------------------------------------

  @Public()
  @Post('buyer/claim/request')
  @HttpCode(HttpStatus.OK)
  async buyerClaimRequest(@Body() dto: BuyerClaimRequestDto) {
    return this.buyerClaimService.requestClaim(dto.email);
  }

  @Public()
  @Post('buyer/claim/verify')
  @HttpCode(HttpStatus.OK)
  async buyerClaimVerify(
    @Body() dto: BuyerClaimVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.buyerClaimService.verifyClaim(
      dto.token,
      dto.phone,
      dto.code,
      this.extractDevice(req),
    );
    this.setAuthCookies(res, result.tokens, resolveSurface(req));
    return result;
  }

  // Seller migration (legacy PHONE_OTP seller → email + password) was
  // retired on 2026-05-18. The only seller account that ever existed
  // (the platform seller) was data-migrated directly to email +
  // password; no live caller of these endpoints remains. If a stale
  // client tries `/v1/auth/seller/migrate-*`, NestJS now returns 404
  // (route not registered) — that's the correct deprecation signal,
  // matching the same approach used when phone-OTP auth was first
  // dropped (CLAUDE.md § 12).

  // ---------------------------------------------------------------------------
  // Refresh / logout / profile / email verification
  // ---------------------------------------------------------------------------

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const surface = resolveSurface(req);
    const token =
      dto.refreshToken || req.cookies?.[cookieNamesFor(surface).refresh];
    if (!token) {
      throw new BadRequestException('Token de rafraîchissement requis');
    }
    const tokens = await this.authService.refreshTokens(
      token,
      this.extractDevice(req),
    );
    this.setAuthCookies(res, tokens, surface);
    return { tokens };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('userId') userId: string,
    @CurrentUser('jti') jti: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Scope the logout to the current session (jti from the access token) so
    // signing out of one surface doesn't revoke the user's sessions on the
    // other surfaces. Falls back to a full logout when jti is absent (e.g. a
    // bearer/mobile token issued before jti was carried).
    await this.authService.logout(userId, jti);
    this.clearAuthCookies(res, resolveSurface(req));
    return { message: 'Déconnexion réussie' };
  }

  @Get('me')
  async getProfile(
    @CurrentUser('userId') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Auto-heal the session-hint cookie. Users whose sessions predate the
    // teka_session cookie (added in PR #80) have valid access/refresh
    // tokens but no hint cookie — the buyer-web auth-store then short-
    // circuits the /me call and renders them as logged out. Re-issuing
    // the hint cookie on every successful /me restores parity for those
    // sessions without forcing a re-login.
    this.refreshSessionHint(res, resolveSurface(req));
    return this.authService.getProfile(userId);
  }

  @Post('email/send-verification')
  @HttpCode(HttpStatus.OK)
  async sendEmailVerification(@CurrentUser('userId') userId: string) {
    return this.authService.sendEmailVerification(userId);
  }

  @Public()
  @Get('email/verify')
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  // ---------------------------------------------------------------------------
  // Cookie helpers
  // ---------------------------------------------------------------------------

  // Per-surface cookies: admin / seller / buyer each get their OWN cookie
  // names (teka_{surface}_access_token, …) even though all share the
  // `.teka.cd` domain (required so the API on api.teka.cd receives them).
  // This keeps the three sessions isolated in one browser — logging out or
  // expiring on one surface no longer touches the others. The surface is
  // resolved from the `X-Teka-Surface` header each web app's api-client sends.
  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
    surface: AuthSurface,
  ) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    // Cross-subdomain cookies: API runs on api.teka.cd but the cookie has to
    // be visible on admin.teka.cd / seller.teka.cd / teka.cd so the web
    // middlewares can detect auth state. Without this, browsers scope the
    // cookie to api.teka.cd only and protected routes always 401-redirect.
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    const names = cookieNamesFor(surface);

    res.cookie(names.access, tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    });

    res.cookie(names.refresh, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    });

    // Non-HttpOnly "session hint" cookie. The two cookies above are HttpOnly
    // (correct — never expose tokens to JS), so the web auth store can't tell
    // whether a session exists without calling /v1/auth/me. That call returned
    // 401 on every guest page load, generating console noise and an
    // unnecessary round-trip on slow 2G/3G connections. This hint cookie
    // carries no auth value — just a boolean flag the frontend checks before
    // issuing the /me call. Lifetime matches the refresh token.
    res.cookie(names.session, '1', {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    });
  }

  private clearAuthCookies(res: Response, surface: AuthSurface) {
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    const names = cookieNamesFor(surface);
    res.clearCookie(names.access, {
      path: '/',
      ...(domain ? { domain } : {}),
    });
    res.clearCookie(names.refresh, {
      path: '/',
      ...(domain ? { domain } : {}),
    });
    res.clearCookie(names.session, {
      path: '/',
      ...(domain ? { domain } : {}),
    });
  }

  // Idempotent helper: re-sets the non-HttpOnly session-hint cookie with
  // the canonical attributes. Called by /me to auto-heal sessions whose hint
  // cookie is missing and to bump the cookie's TTL on every active check.
  private refreshSessionHint(res: Response, surface: AuthSurface) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    res.cookie(cookieNamesFor(surface).session, '1', {
      httpOnly: false,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    });
  }

  // Pulls User-Agent + client IP from the request so the auth service can
  // persist them on the issued RefreshToken row (used by the "Appareils"
  // sessions list on profile pages, added 2026-05-20). Both fields are
  // best-effort — missing values stay null and the UI renders a fallback.
  // Express's `req.ip` honours the `trust proxy` setting that's enabled in
  // main.ts, so behind nginx the value is the real client IP, not the
  // proxy's.
  private extractDevice(req: Request) {
    const userAgent = req.headers['user-agent'];
    return {
      userAgent: typeof userAgent === 'string' ? userAgent : undefined,
      ipAddress: req.ip ?? undefined,
    };
  }
}
