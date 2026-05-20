import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationPrefsService } from './notification-prefs.service';
import { SessionsService } from './sessions.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [UsersController],
  providers: [UsersService, NotificationPrefsService, SessionsService],
  exports: [UsersService, NotificationPrefsService, SessionsService],
})
export class UsersModule {}
