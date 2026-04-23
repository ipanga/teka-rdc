import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SmsModule } from '../sms/sms.module';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsController } from './broadcasts.controller';

@Module({
  imports: [PrismaModule, SmsModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
