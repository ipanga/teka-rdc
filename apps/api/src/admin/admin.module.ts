import { Module } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminSellersController } from './admin-sellers.controller';
import { AdminProductsService } from './admin-products.service';
import { AdminProductsController } from './admin-products.controller';
import { AdminDeliveryZonesController } from './admin-delivery-zones.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminCitiesController } from './admin-cities.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { CitiesModule } from '../cities/cities.module';

@Module({
  imports: [PrismaModule, DeliveryZonesModule, CitiesModule],
  controllers: [
    AdminUsersController,
    AdminSellersController,
    AdminProductsController,
    AdminDeliveryZonesController,
    AdminOrdersController,
    AdminStatsController,
    AdminReviewsController,
    AdminCitiesController,
  ],
  providers: [
    AdminUsersService,
    AdminProductsService,
    AdminOrdersService,
    AdminStatsService,
    AdminReviewsService,
  ],
})
export class AdminModule {}
