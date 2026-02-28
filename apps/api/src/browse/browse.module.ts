import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { BrowseService } from './browse.service';
import { BrowseController } from './browse.controller';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [BrowseController],
  providers: [BrowseService],
})
export class BrowseModule {}
