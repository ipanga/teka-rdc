import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContentService } from './content.service';
import { ContentController } from './content.controller';
import { ContentPublicController } from './content-public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ContentController, ContentPublicController],
  providers: [ContentService],
})
export class ContentModule {}
