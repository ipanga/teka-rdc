import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [SmsModule, EmailModule, RedisModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
