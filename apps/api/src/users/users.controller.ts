import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { NotificationPrefsService } from './notification-prefs.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { NotificationPrefsDto } from './dto/notification-prefs.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private notificationPrefs: NotificationPrefsService,
  ) {}

  @Get('profile')
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('profile')
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  /**
   * Upload a new avatar for the current user. Multipart form field `image`.
   * Open to any authenticated role (buyer / seller / admin all share the
   * same User.avatar column). Returns `{ avatar: <url> }`.
   */
  @Post('avatar')
  @UseInterceptors(FileInterceptor('image'))
  async uploadAvatar(
    @CurrentUser('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(userId, file);
  }

  @Delete('profile')
  async deleteAccount(@CurrentUser('userId') userId: string) {
    return this.usersService.deleteAccount(userId);
  }

  /**
   * Notification preferences. Two toggles for now (smsOrderUpdates,
   * smsBroadcasts) with all-on defaults. Transactional sends (OTP,
   * password reset, email verify) ignore these.
   */
  @Get('notification-prefs')
  async getNotificationPrefs(@CurrentUser('userId') userId: string) {
    return this.notificationPrefs.resolve(userId);
  }

  @Patch('notification-prefs')
  async updateNotificationPrefs(
    @CurrentUser('userId') userId: string,
    @Body() dto: NotificationPrefsDto,
  ) {
    return this.notificationPrefs.update(userId, dto);
  }
}
