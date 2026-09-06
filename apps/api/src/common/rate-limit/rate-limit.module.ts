import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RateLimitService } from './rate-limit.service';
import { PrismaRateLimitStore, RateLimitStore } from './rate-limit.store';
import { IdentityThrottleGuard } from './identity-throttle.guard';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    { provide: RateLimitStore, useClass: PrismaRateLimitStore },
    RateLimitService,
    IdentityThrottleGuard,
  ],
  exports: [RateLimitService, RateLimitStore, IdentityThrottleGuard],
})
export class RateLimitModule {}
