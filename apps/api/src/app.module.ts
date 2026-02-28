import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';
import { SellersModule } from './sellers/sellers.module';
import { AdminModule } from './admin/admin.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { BrowseModule } from './browse/browse.module';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { PayoutsModule } from './payouts/payouts.module';
import { CommissionModule } from './commission/commission.module';
import { ReviewsModule } from './reviews/reviews.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { MessagingModule } from './messaging/messaging.module';
import { BannersModule } from './banners/banners.module';
import { ContentModule } from './content/content.module';
import { SettingsModule } from './settings/settings.module';
import { PromotionsModule } from './promotions/promotions.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { ReportsModule } from './reports/reports.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test'
          ? '../../.env.test'
          : '../../.env.development',
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    SellersModule,
    AdminModule,
    CategoriesModule,
    ProductsModule,
    BrowseModule,
    DeliveryZonesModule,
    CartModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    PayoutsModule,
    CommissionModule,
    ReviewsModule,
    WishlistModule,
    MessagingModule,
    BannersModule,
    ContentModule,
    SettingsModule,
    PromotionsModule,
    BroadcastsModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
