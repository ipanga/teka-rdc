import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellerDocumentsModule } from './seller-documents.module';
import { SellerVerificationService } from './seller-verification.service';
import { SellerVerificationController } from './seller-verification.controller';
import { AdminSellerVerificationController } from './admin-seller-verification.controller';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule, SellerDocumentsModule],
  controllers: [SellerVerificationController, AdminSellerVerificationController],
  providers: [SellerVerificationService],
  exports: [SellerVerificationService],
})
export class SellerVerificationModule {}
