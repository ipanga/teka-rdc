import { Module } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminSellersController } from './admin-sellers.controller';
import { AdminProductsService } from './admin-products.service';
import { AdminProductsController } from './admin-products.controller';
import { CatalogResetService } from './catalog-reset.service';
import { AdminDeliveryZonesController } from './admin-delivery-zones.controller';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminReviewsService } from './admin-reviews.service';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminCitiesController } from './admin-cities.controller';
import { AdminBrandsController } from './admin-brands.controller';
import { AdminNotificationsController } from './admin-notifications.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';
import { CitiesModule } from '../cities/cities.module';
import { BrandsModule } from '../brands/brands.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    PrismaModule,
    DeliveryZonesModule,
    CitiesModule,
    NotificationsModule,
    EmailModule,
    CloudinaryModule,
    AuditModule,
    BrandsModule,
    PaymentsModule,
  ],
  controllers: [
    AdminUsersController,
    AdminSellersController,
    AdminProductsController,
    AdminDeliveryZonesController,
    AdminOrdersController,
    AdminStatsController,
    AdminReviewsController,
    AdminCitiesController,
    AdminBrandsController,
    AdminNotificationsController,
  ],
  providers: [
    AdminUsersService,
    AdminProductsService,
    CatalogResetService,
    AdminOrdersService,
    AdminStatsService,
    AdminReviewsService,
  ],
  exports: [CatalogResetService],
})
export class AdminModule {}
