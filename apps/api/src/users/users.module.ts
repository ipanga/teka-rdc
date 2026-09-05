import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationPrefsService } from './notification-prefs.service';
import { SessionsService } from './sessions.service';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionController } from './account-deletion.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';
import { SellerDocumentsModule } from '../seller-verification/seller-documents.module';
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PrismaModule,
    CloudinaryModule,
    AuthModule,
    PushModule,
    EmailModule,
    SellerDocumentsModule,
  ],
  controllers: [UsersController, AccountDeletionController],
  providers: [
    UsersService,
    NotificationPrefsService,
    SessionsService,
    AccountDeletionService,
  ],
  exports: [UsersService, NotificationPrefsService, SessionsService],
})
export class UsersModule {}
