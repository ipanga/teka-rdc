import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WishlistService } from './wishlist.service';
import { WishlistController } from './wishlist.controller';

@Module({
  imports: [PrismaModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
