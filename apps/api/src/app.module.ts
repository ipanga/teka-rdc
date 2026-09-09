import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AddressesModule } from './addresses/addresses.module';
import { SellersModule } from './sellers/sellers.module';
import { SellerVerificationModule } from './seller-verification/seller-verification.module';
import { AdminModule } from './admin/admin.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CitiesModule } from './cities/cities.module';
import { BrandsModule } from './brands/brands.module';
import { BrowseModule } from './browse/browse.module';
import { DeliveryZonesModule } from './delivery-zones/delivery-zones.module';
import { CartModule } from './cart/cart.module';
import { OrdersModule } from './orders/orders.module';
import { CheckoutModule } from './checkout/checkout.module';
import { PaymentsModule } from './payments/payments.module';
import { PayoutsModule } from './payouts/payouts.module';
import { ReturnsModule } from './returns/returns.module';
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
import { ContactModule } from './contact/contact.module';
import { PushModule } from './push/push.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { IdentityThrottleGuard } from './common/rate-limit/identity-throttle.guard';
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
    // Per-IP backstop (in-memory, per process). D8 (2026-09-06): the real
    // authentication limits are identity-keyed in RateLimitModule; this layer
    // only caps raw request volume. Behind Cloudflare + carrier NAT one IP is
    // many users, so per-route @Throttle overrides stay generous. French copy
    // because clients surface `error.message` verbatim.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 100 }],
      errorMessage: 'Trop de requêtes. Veuillez patienter avant de réessayer.',
    }),
    RateLimitModule,
    // In-process scheduler for the daily account-deletion purge (@Cron).
    ScheduleModule.forRoot(),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AddressesModule,
    SellersModule,
    SellerVerificationModule,
    AdminModule,
    CategoriesModule,
    ProductsModule,
    CitiesModule,
    BrandsModule,
    BrowseModule,
    DeliveryZonesModule,
    CartModule,
    OrdersModule,
    CheckoutModule,
    PaymentsModule,
    PayoutsModule,
    ReturnsModule,
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
    ContactModule,
    PushModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Per-user limits (@IdentityThrottle) — after JwtAuthGuard so req.user is set.
    { provide: APP_GUARD, useClass: IdentityThrottleGuard },
  ],
})
export class AppModule {}
