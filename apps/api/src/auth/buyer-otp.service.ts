import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'crypto';
import {
  DEV_OTP_CODE,
  OTP_EXPIRY_MINUTES,
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_RATE_LIMIT_MAX,
  OTP_RATE_LIMIT_WINDOW_SECONDS,
} from '@teka/shared';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AuthService, AuthTokens } from './auth.service';
import { PostHogService } from '../analytics/posthog.service';

export interface RequestOtpResult {
  expiresInSeconds: number;
  cooldownSeconds: number;
}

export interface VerifyOtpResult {
  user: any;
  tokens: AuthTokens;
}

@Injectable()
export class BuyerOtpService {
  private readonly logger = new Logger(BuyerOtpService.name);

  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsappService,
    private configService: ConfigService,
    private authService: AuthService,
    private analytics: PostHogService,
  ) {}

  // ---------------------------------------------------------------------------
  // Public surface — controller-facing
  // ---------------------------------------------------------------------------

  async requestOtp(phone: string): Promise<RequestOtpResult> {
    await this.assertRateLimit(phone);
    const { expiresInSeconds, cooldownSeconds } = await this.issueOtp(phone, {
      isResend: false,
    });
    return { expiresInSeconds, cooldownSeconds };
  }

  async resendOtp(phone: string): Promise<RequestOtpResult> {
    await this.assertResendCooldown(phone);
    await this.assertRateLimit(phone);
    const { expiresInSeconds, cooldownSeconds } = await this.issueOtp(phone, {
      isResend: true,
    });
    return { expiresInSeconds, cooldownSeconds };
  }

  async verifyOtp(
    phone: string,
    code: string,
    firstName?: string,
    lastName?: string,
    device?: { userAgent?: string; ipAddress?: string },
  ): Promise<VerifyOtpResult> {
    // App-store review login is a login-only, allowlisted bypass — it must NOT
    // consume/validate a real Otp row, so check it before verifyOtpInternal.
    const verified =
      this.isReviewLogin(phone, code) ||
      (await this.verifyOtpInternal(phone, code));
    if (!verified) {
      throw new UnauthorizedException('Code OTP invalide ou expiré');
    }

    const { user, isNew } = await this.findOrCreateUserByPhone(
      phone,
      firstName,
      lastName,
    );
    if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
      throw new ForbiddenException('Votre compte a été suspendu.');
    }

    const tokens = await this.authService.generateTokensForUser(
      user.id,
      user.role,
      user.phone,
      device,
    );
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), phoneVerified: true },
    });

    // Server-owned auth event. First verify for a phone => registration,
    // otherwise a login. distinctId is the public user.id so the client's
    // post-verify identify(user.id) stitches the anonymous session.
    this.analytics.capture(user.id, isNew ? 'user_registered' : 'user_login', {
      role: user.role,
      method: 'whatsapp_otp',
    });

    return { user: this.authService.sanitize(user), tokens };
  }

  /**
   * App-store review login: a tightly-scoped, env-gated bypass so Apple/Google
   * reviewers can sign in without a live WhatsApp OTP.
   *
   * Accepts the fixed OTP ONLY when ALL hold: the feature is explicitly enabled
   * (`APP_REVIEW_LOGIN_ENABLED`), the submitted phone EXACTLY equals the single
   * allowlisted `APP_REVIEW_BUYER_PHONE_E164`, and the code EXACTLY equals
   * `APP_REVIEW_BUYER_OTP`. Every other phone always uses a real Gupshup OTP.
   * This is NOT a universal bypass and the code is never logged.
   */
  private isReviewLogin(phone: string, code: string): boolean {
    const enabledRaw = this.configService.get<string | boolean>(
      'APP_REVIEW_LOGIN_ENABLED',
    );
    const enabled = enabledRaw === true || enabledRaw === 'true';
    if (!enabled) return false;

    const allowPhone = this.configService.get<string>(
      'APP_REVIEW_BUYER_PHONE_E164',
      '',
    );
    const allowCode = this.configService.get<string>(
      'APP_REVIEW_BUYER_OTP',
      '',
    );
    // Never match on empty config — avoids accidentally allowing '' == ''.
    if (!allowPhone || !allowCode) return false;

    const match = phone === allowPhone && code === allowCode;
    if (match) {
      this.logger.warn(
        '[app-review] review login accepted for the allowlisted phone',
      );
    }
    return match;
  }

  /**
   * Reused by BuyerClaimService: validates an OTP without performing the
   * find-or-create-user side effect. Returns whether the supplied code
   * matched a non-expired Otp row for the phone. On match the row is
   * consumed (deleted).
   */
  async verifyOtpInternal(phone: string, code: string): Promise<boolean> {
    const record = await this.prisma.otp.findFirst({
      where: { phone, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      return false;
    }

    const submittedHash = Buffer.from(this.hashCode(code), 'hex');
    const storedHash = Buffer.from(record.code, 'hex');
    const matches =
      submittedHash.length === storedHash.length &&
      timingSafeEqual(submittedHash, storedHash);

    if (!matches) {
      const attempts = record.attempts + 1;
      if (attempts >= OTP_MAX_ATTEMPTS) {
        await this.prisma.otp.deleteMany({ where: { id: record.id } });
      } else {
        await this.prisma.otp.update({
          where: { id: record.id },
          data: { attempts },
        });
      }
      return false;
    }

    // One-shot: delete on success to prevent replay.
    await this.prisma.otp.deleteMany({ where: { id: record.id } });
    return true;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async issueOtp(
    phone: string,
    opts: { isResend: boolean },
  ): Promise<RequestOtpResult> {
    const code = this.generateCode();
    const hash = this.hashCode(code);
    const expiryMinutes = this.configService.get<number>(
      'OTP_EXPIRY_MINUTES',
      OTP_EXPIRY_MINUTES,
    );
    const expiresAt = new Date(Date.now() + expiryMinutes * 60_000);

    await this.prisma.$transaction([
      this.prisma.otp.deleteMany({ where: { phone } }),
      this.prisma.otp.create({
        data: { phone, code: hash, expiresAt },
      }),
    ]);

    const delivered = await this.whatsapp.sendOtp(phone, code);
    if (!delivered) {
      // Soft-fail: in production this means the provider rejected the message
      // (e.g. unapproved template). We still return success so a typo'd phone
      // can't enumerate, but the caller's UI shows "le code arrive sous peu".
      this.logger.warn(
        `OTP delivery returned not-ok for ${phone} (resend=${opts.isResend})`,
      );
    }

    return {
      expiresInSeconds: expiryMinutes * 60,
      cooldownSeconds: this.computeResendCooldown(1),
    };
  }

  private async assertRateLimit(phone: string): Promise<void> {
    const windowSeconds = OTP_RATE_LIMIT_WINDOW_SECONDS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowSeconds * 1000);

    // Clean any expired window for this phone so the count starts fresh.
    await this.prisma.otpRateLimit.deleteMany({
      where: { phone, expiresAt: { lte: now } },
    });

    const existing = await this.prisma.otpRateLimit.findFirst({
      where: { phone, expiresAt: { gt: now } },
    });

    if (!existing) {
      await this.prisma.otpRateLimit.create({
        data: { phone, count: 1, expiresAt },
      });
      return;
    }

    if (existing.count >= OTP_RATE_LIMIT_MAX) {
      throw new HttpException(
        'Trop de demandes. Réessayez dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.prisma.otpRateLimit.update({
      where: { id: existing.id },
      data: { count: existing.count + 1 },
    });
  }

  private async assertResendCooldown(phone: string): Promise<void> {
    const record = await this.prisma.otp.findFirst({
      where: { phone, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) {
      // No active OTP — treat resend as a fresh request, no cooldown.
      return;
    }
    const elapsedSec = Math.floor(
      (Date.now() - record.createdAt.getTime()) / 1000,
    );
    const cooldown = this.computeResendCooldown(1);
    if (elapsedSec < cooldown) {
      throw new HttpException(
        `Veuillez patienter ${cooldown - elapsedSec}s avant de renvoyer.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private computeResendCooldown(_attempt: number): number {
    // Exponential backoff is documented in the plan but we keep step-1 simple:
    // 30s minimum between resends. Subsequent backoff (60s, 120s) is enforced
    // by the rate-limit ceiling — once OTP_RATE_LIMIT_MAX is hit, the next
    // resend is blocked for the remainder of the 600s window.
    return 30;
  }

  private generateCode(): string {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const provider = this.configService
      .get<string>('WHATSAPP_PROVIDER', 'mock')
      .toLowerCase();
    if (!isProd && provider === 'mock') {
      return DEV_OTP_CODE;
    }
    const upper = 10 ** OTP_LENGTH;
    return randomInt(0, upper).toString().padStart(OTP_LENGTH, '0');
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  private async findOrCreateUserByPhone(
    phone: string,
    firstName?: string,
    lastName?: string,
  ) {
    const existing = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existing) {
      return { user: existing, isNew: false };
    }
    const user = await this.prisma.user.create({
      data: {
        phone,
        role: 'BUYER',
        status: 'ACTIVE',
        authProvider: 'PHONE_OTP',
        phoneVerified: true,
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      },
    });
    return { user, isNew: true };
  }
}
