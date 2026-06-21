import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { NotificationPrefsService } from './notification-prefs.service';
import { SessionsService } from './sessions.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { NotificationPrefsDto } from './dto/notification-prefs.dto';
import { PreferredCityDto } from './dto/preferred-city.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private notificationPrefs: NotificationPrefsService,
    private sessions: SessionsService,
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
   * Set (or clear with `cityId: null`) the current buyer's preferred delivery
   * town (Town Architecture Refactor). Lets the chosen town follow the user
   * across devices — the buyer apps call this on town change while logged in,
   * and hydrate from `preferredCityId` on the next /me.
   */
  @Patch('me/preferred-city')
  async setPreferredCity(
    @CurrentUser('userId') userId: string,
    @Body() dto: PreferredCityDto,
  ) {
    return this.usersService.setPreferredCity(userId, dto.cityId ?? null);
  }

  /**
   * Notification preferences. Three toggles (smsOrderUpdates,
   * pushBroadcasts, emailBroadcasts) with all-on defaults. The
   * smsOrderUpdates name is legacy — it now gates push + email-fallback
   * order events (the SMS branch was deleted in PR C2, 2026-05-26).
   * Transactional sends (OTP, password reset, email verify) ignore these.
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

  /**
   * Active sessions for the current user — drives the "Appareils" card
   * on every profile page. The row whose id matches the caller's `jti`
   * (the access token's session id) is marked `current: true`.
   */
  @Get('sessions')
  async listSessions(
    @CurrentUser('userId') userId: string,
    @CurrentUser('jti') jti: string,
  ) {
    return this.sessions.list(userId, jti);
  }

  /**
   * Revoke a single non-current session. The current session refuses
   * self-revocation (400) — callers should hit /v1/auth/logout for that.
   */
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentUser('userId') userId: string,
    @CurrentUser('jti') jti: string,
    @Param('id') id: string,
  ) {
    return this.sessions.revoke(userId, id, jti);
  }

  /**
   * Bulk-revoke every active session except the caller's. The "logout
   * everywhere else" button on profile pages.
   */
  @Delete('sessions')
  async revokeOtherSessions(
    @CurrentUser('userId') userId: string,
    @CurrentUser('jti') jti: string,
  ) {
    return this.sessions.revokeAllExceptCurrent(userId, jti);
  }
}
