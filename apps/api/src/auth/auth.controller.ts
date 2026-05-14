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
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { EmailLoginDto } from './dto/email-login.dto';
import { EmailRegisterDto } from './dto/email-register.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { SellerMigrateCheckDto } from './dto/seller-migrate-check.dto';
import { SellerMigrateLinkEmailDto } from './dto/seller-migrate-link-email.dto';
import { SellerPasswordSetupDto } from './dto/seller-password-setup.dto';
import { BuyerMigrateCheckDto } from './dto/buyer-migrate-check.dto';
import { BuyerMigrateLinkEmailDto } from './dto/buyer-migrate-link-email.dto';
import { BuyerPasswordSetupDto } from './dto/buyer-password-setup.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // Email + password registration. Role is server-assigned (never trust the
  // client): /register/buyer creates BUYER, /register/email creates SELLER.
  // Admins are seeded out-of-band — there is no admin register endpoint.
  // ---------------------------------------------------------------------------

  @Public()
  @Post('register/buyer')
  async registerBuyer(
    @Body() dto: EmailRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerBuyerWithEmail(dto);
    this.setAuthCookies(res, result.tokens);
    return result;
  }

  @Public()
  @Post('register/email')
  async registerSeller(
    @Body() dto: EmailRegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.registerSellerWithEmail(dto);
    this.setAuthCookies(res, result.tokens);
    return result;
  }

  @Public()
  @Post('login/email')
  @HttpCode(HttpStatus.OK)
  async loginWithEmail(
    @Body() dto: EmailLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.loginWithEmail(dto);
    this.setAuthCookies(res, result.tokens);
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

  // ---------------------------------------------------------------------------
  // Buyer migration (legacy PHONE_OTP buyer → email + password).
  // ---------------------------------------------------------------------------

  @Public()
  @Post('buyer/migrate-check')
  @HttpCode(HttpStatus.OK)
  async buyerMigrateCheck(@Body() dto: BuyerMigrateCheckDto) {
    return this.authService.migrateBuyerCheck(dto);
  }

  @Public()
  @Post('buyer/migrate-link-email')
  @HttpCode(HttpStatus.OK)
  async buyerMigrateLinkEmail(@Body() dto: BuyerMigrateLinkEmailDto) {
    return this.authService.migrateBuyerLinkEmail(dto);
  }

  @Public()
  @Post('buyer/setup-password')
  @HttpCode(HttpStatus.OK)
  async buyerSetupPassword(
    @Body() dto: BuyerPasswordSetupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.setupBuyerPassword(dto);
    this.setAuthCookies(res, result.tokens);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Seller migration (legacy PHONE_OTP seller → email + password).
  // ---------------------------------------------------------------------------

  @Public()
  @Post('seller/migrate-check')
  @HttpCode(HttpStatus.OK)
  async sellerMigrateCheck(@Body() dto: SellerMigrateCheckDto) {
    return this.authService.migrateSellerCheck(dto);
  }

  @Public()
  @Post('seller/migrate-link-email')
  @HttpCode(HttpStatus.OK)
  async sellerMigrateLinkEmail(@Body() dto: SellerMigrateLinkEmailDto) {
    return this.authService.migrateSellerLinkEmail(dto);
  }

  @Public()
  @Post('seller/setup-password')
  @HttpCode(HttpStatus.OK)
  async sellerSetupPassword(
    @Body() dto: SellerPasswordSetupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.setupSellerPassword(dto);
    this.setAuthCookies(res, result.tokens);
    return result;
  }

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
    const token = dto.refreshToken || req.cookies?.['teka_refresh_token'];
    if (!token) {
      throw new BadRequestException('Token de rafraîchissement requis');
    }
    const tokens = await this.authService.refreshTokens(token);
    this.setAuthCookies(res, tokens);
    return { tokens };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('userId') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(userId);
    this.clearAuthCookies(res);
    return { message: 'Déconnexion réussie' };
  }

  @Get('me')
  async getProfile(@CurrentUser('userId') userId: string) {
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

  private setAuthCookies(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    const isProduction = this.configService.get('NODE_ENV') === 'production';
    // Cross-subdomain cookies: API runs on api.teka.cd but the cookie has to
    // be visible on admin.teka.cd / seller.teka.cd / teka.cd so the web
    // middlewares can detect auth state. Without this, browsers scope the
    // cookie to api.teka.cd only and protected routes always 401-redirect.
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;

    res.cookie('teka_access_token', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    });

    res.cookie('teka_refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(domain ? { domain } : {}),
    });
  }

  private clearAuthCookies(res: Response) {
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    res.clearCookie('teka_access_token', { path: '/', ...(domain ? { domain } : {}) });
    res.clearCookie('teka_refresh_token', { path: '/', ...(domain ? { domain } : {}) });
  }
}
