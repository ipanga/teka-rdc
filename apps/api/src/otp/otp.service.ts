import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, timingSafeEqual } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';

interface OtpData {
  code: string;
  attempts: number;
  createdAt: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpExpirySeconds: number;
  private readonly isDev: boolean;
  private readonly maxAttempts = 5;
  private readonly rateLimitMax = 3;
  private readonly rateLimitWindowSeconds = 600; // 10 minutes

  constructor(
    private redisService: RedisService,
    private smsService: SmsService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {
    this.otpExpirySeconds = (this.configService.get<number>('OTP_EXPIRY_MINUTES', 5)) * 60;
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
  }

  async requestOtp(phone: string, email?: string): Promise<{ expiresIn: number }> {
    // Rate limiting
    const rateLimitKey = `otp:rate:${phone}`;
    const rateCount = await this.redisService.get(rateLimitKey);

    if (rateCount && parseInt(rateCount, 10) >= this.rateLimitMax) {
      throw new HttpException(
        'Trop de demandes de code. Veuillez patienter 10 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Generate 6-digit code
    const code = this.isDev ? '123456' : String(randomInt(100000, 999999));

    // Store OTP in Redis
    const otpData: OtpData = {
      code,
      attempts: 0,
      createdAt: Date.now(),
    };
    await this.redisService.setJson(`otp:${phone}`, otpData, this.otpExpirySeconds);

    // Increment rate limit
    if (rateCount) {
      await this.redisService.set(rateLimitKey, String(parseInt(rateCount, 10) + 1), this.rateLimitWindowSeconds);
    } else {
      await this.redisService.set(rateLimitKey, '1', this.rateLimitWindowSeconds);
    }

    // Send OTP via SMS
    await this.smsService.sendOtp(phone, code);

    // Also send via email if available (fallback)
    if (email) {
      await this.emailService.sendOtpEmail(email, code);
    }

    this.logger.log(`OTP requested for ${phone}`);
    return { expiresIn: this.otpExpirySeconds };
  }

  async verifyOtp(phone: string, code: string): Promise<boolean> {
    // In dev mode, accept the dev code
    if (this.isDev && code === '123456') {
      await this.redisService.del(`otp:${phone}`);
      return true;
    }

    const otpKey = `otp:${phone}`;
    const otpData = await this.redisService.getJson<OtpData>(otpKey);

    if (!otpData) {
      throw new BadRequestException('Code expiré ou non demandé. Veuillez en demander un nouveau.');
    }

    // Brute force protection
    if (otpData.attempts >= this.maxAttempts) {
      await this.redisService.del(otpKey);
      throw new BadRequestException(
        'Trop de tentatives. Veuillez demander un nouveau code.',
      );
    }

    // Timing-safe comparison
    const isValid = this.safeCompare(otpData.code, code);

    if (!isValid) {
      // Increment attempts
      otpData.attempts += 1;
      const remainingTtl = this.otpExpirySeconds - Math.floor((Date.now() - otpData.createdAt) / 1000);
      if (remainingTtl > 0) {
        await this.redisService.setJson(otpKey, otpData, remainingTtl);
      }
      throw new BadRequestException('Code invalide. Veuillez réessayer.');
    }

    // Valid — clean up
    await this.redisService.del(otpKey);
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
