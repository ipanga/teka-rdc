import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BrowseService } from './browse.service';
import { BrowseController } from './browse.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BrowseController],
  providers: [BrowseService],
})
export class BrowseModule {}
