import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushService } from './push.service';
import { DeviceTokensController } from './device-tokens.controller';
import { DeviceTokensService } from './device-tokens.service';

@Module({
  imports: [PrismaModule],
  providers: [PushService, DeviceTokensService],
  controllers: [DeviceTokensController],
  exports: [PushService, DeviceTokensService],
})
export class PushModule {}
