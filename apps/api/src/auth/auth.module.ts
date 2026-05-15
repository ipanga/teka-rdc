import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { BuyerOtpService } from './buyer-otp.service';
import { BuyerClaimService } from './buyer-claim.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: configService.get('JWT_EXPIRY', '15m') },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    ConfigModule,
    EmailModule,
    WhatsappModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, BuyerOtpService, BuyerClaimService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
