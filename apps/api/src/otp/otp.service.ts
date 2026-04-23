import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpExpirySeconds: number;
  private readonly isDev: boolean;
  private readonly maxAttempts = 5;
  private readonly rateLimitMax = 3;
  private readonly rateLimitWindowSeconds = 600; // 10 minutes

  constructor(
    private prisma: PrismaService,
    private smsService: SmsService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    this.otpExpirySeconds = (this.configService.get<number>('OTP_EXPIRY_MINUTES', 5)) * 60;
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
  }

  async requestOtp(
    phone: string,
    email?: string,
    channel: 'sms' | 'email' | 'both' = 'both',
  ): Promise<{ expiresIn: number; channel: 'sms' | 'email' | 'both' }> {
    const now = new Date();

    // Rate limiting — count unexpired rate limit entries
    const rateCount = await this.prisma.otpRateLimit.count({
      where: {
        phone,
        expiresAt: { gt: now },
      },
    });

    if (rateCount >= this.rateLimitMax) {
      throw new HttpException(
        'Trop de demandes de code. Veuillez patienter 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate 6-digit code
    const code = this.isDev ? '123456' : String(randomInt(100000, 999999));

    // Delete any existing OTP for this phone
    await this.prisma.otp.deleteMany({ where: { phone } });

    // Store OTP in database
    const expiresAt = new Date(now.getTime() + this.otpExpirySeconds * 1000);
    await this.prisma.otp.create({
      data: {
        phone,
        code,
        attempts: 0,
        expiresAt,
      },
    });

    // Add rate limit entry
    const rateLimitExpiresAt = new Date(now.getTime() + this.rateLimitWindowSeconds * 1000);
    await this.prisma.otpRateLimit.create({
      data: {
        phone,
        expiresAt: rateLimitExpiresAt,
      },
    });

    const wantsSms = channel === 'sms' || channel === 'both';
    const wantsEmail = channel === 'email' || (channel === 'both' && !!email);

    if (wantsSms) {
      await this.smsService.sendOtp(phone, code);
    }

    if (wantsEmail) {
      if (!email) {
        throw new BadRequestException('Aucun email fourni pour l\'envoi du code');
      }
      await this.emailService.sendOtpEmail(email, code);
    }

    this.logger.log(`OTP requested for ${phone} via ${channel}`);
    return { expiresIn: this.otpExpirySeconds, channel };
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    // In dev mode, accept the dev code
    if (this.isDev && code === '123456') {
      await this.prisma.otp.deleteMany({ where: { phone } });
      return true;
    }

    const now = new Date();
    const otp = await this.prisma.otp.findFirst({
      where: {
        phone,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new BadRequestException('Code expiré ou non demandé. Veuillez en demander un nouveau.');
    }

    // Brute force protection
    if (otp.attempts >= this.maxAttempts) {
      await this.prisma.otp.delete({ where: { id: otp.id } });
      throw new BadRequestException(
        'Trop de tentatives. Veuillez demander un nouveau code.',
      );
    }

    // Timing-safe comparison
    const isValid = this.safeCompare(otp.code, code);

    if (!isValid) {
      // Increment attempts
      await this.prisma.otp.update({
        where: { id: otp.id },
        data: { attempts: otp.attempts + 1 },
      });
      throw new BadRequestException('Code invalide. Veuillez réessayer.');
    }

    // Valid — clean up
    await this.prisma.otp.delete({ where: { id: otp.id } });
    return true;
  }

  private safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
    } catch {
      return false;
    }
  }
}
