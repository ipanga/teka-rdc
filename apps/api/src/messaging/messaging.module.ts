import { Module } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController, ConversationsController } from './messaging.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MessagingController, ConversationsController],
  providers: [MessagingService],
})
export class MessagingModule {}
