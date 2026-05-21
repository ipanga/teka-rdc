import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { DeviceTokensService } from './device-tokens.service';
import { RegisterDeviceTokenDto } from './dto/register-device-token.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Push-notification device-token registration. The Flutter app calls
 * POST on cold start (once it has a token from `FirebaseMessaging.getToken`)
 * and on token refresh; DELETE on logout. JWT-guarded — the controller
 * inherits the global JwtAuthGuard so unauthenticated requests are
 * rejected before they reach this code.
 */
@Controller('v1/users/device-tokens')
export class DeviceTokensController {
  constructor(private deviceTokens: DeviceTokensService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async register(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.deviceTokens.register(userId, dto);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.OK)
  async unregister(
    @CurrentUser('userId') userId: string,
    @Param('token') token: string,
  ) {
    return this.deviceTokens.unregister(userId, token);
  }
}
