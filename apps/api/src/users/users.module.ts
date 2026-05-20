import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { NotificationPrefsService } from './notification-prefs.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [PrismaModule, CloudinaryModule],
  controllers: [UsersController],
  providers: [UsersService, NotificationPrefsService],
  exports: [UsersService, NotificationPrefsService],
})
export class UsersModule {}
