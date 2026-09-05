import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { SellerDocumentStorageService } from './seller-document-storage.service';

/** Storage half only (no notifications) so UsersModule can import it. */
@Module({
  imports: [PrismaModule, CloudinaryModule],
  providers: [SellerDocumentStorageService],
  exports: [SellerDocumentStorageService],
})
export class SellerDocumentsModule {}
