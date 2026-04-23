import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BannersService } from './banners.service';
import { BannersController } from './banners.controller';
import { BannersPublicController } from './banners-public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [BannersController, BannersPublicController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
