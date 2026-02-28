import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { ContentPublicController } from './content-public.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [ContentController, ContentPublicController],
  providers: [ContentService],
})
export class ContentModule {}
