import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SettingsPublicController } from './settings-public.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [SettingsController, SettingsPublicController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
