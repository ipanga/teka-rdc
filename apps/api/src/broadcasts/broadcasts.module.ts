import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';
import { UsersModule } from '../users/users.module';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsController } from './broadcasts.controller';

@Module({
  imports: [PrismaModule, PushModule, EmailModule, UsersModule],
  controllers: [BroadcastsController],
  providers: [BroadcastsService],
  exports: [BroadcastsService],
})
export class BroadcastsModule {}
