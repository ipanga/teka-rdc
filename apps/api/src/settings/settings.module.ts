import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { SettingsPublicController } from './settings-public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SettingsController, SettingsPublicController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
