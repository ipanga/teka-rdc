import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PromotionsService } from './promotions.service';
import { PromotionsController } from './promotions.controller';
import { SellerPromotionsController } from './seller-promotions.controller';
import { PromotionsPublicController } from './promotions-public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    PromotionsController,
    SellerPromotionsController,
    PromotionsPublicController,
  ],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
