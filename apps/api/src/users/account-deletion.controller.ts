import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  cookieNamesFor,
  type AuthSurface,
} from '../auth/surface.util';
import { AccountDeletionService } from './account-deletion.service';
import { RequestAccountDeletionDto } from './dto/account-deletion.dto';

/**
 * Self-service account deletion (30-day pending-deletion). Authenticated —
 * guarded by the global JwtAuthGuard, so a user can only act on their own
 * account (`userId` comes from the verified token).
 */
@Controller('v1/users/account/deletion')
export class AccountDeletionController {
  constructor(
    private readonly deletionService: AccountDeletionService,
    private readonly configService: ConfigService,
  ) {}

  /** Current pending-deletion status (drives the UI's pending banner). */
  @Get()
  async status(@CurrentUser('userId') userId: string) {
    return this.deletionService.getStatus(userId);
  }

  /**
   * Requests deletion: role-specific re-auth + business safeguards, then
   * schedules anonymization and signs the account out everywhere.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async request(
    @CurrentUser('userId') userId: string,
    @CurrentUser('surface') surface: AuthSurface | null,
    @Body() dto: RequestAccountDeletionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.deletionService.requestDeletion(userId, dto);
    // Sign out on this surface too — the refresh tokens are already revoked
    // server-side; clear the cookies so the browser session ends immediately.
    // The surface is the session's own (from the stored role), never a claim.
    this.clearAuthCookies(res, surface);
    return result;
  }

  /** Cancels a pending deletion while still authenticated. */
  @Delete()
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser('userId') userId: string) {
    return this.deletionService.cancelDeletion(userId);
  }

  private clearAuthCookies(res: Response, surface: AuthSurface | null) {
    if (!surface) return;
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    const names = cookieNamesFor(surface);
    for (const name of [names.access, names.refresh, names.session]) {
      res.clearCookie(name, { path: '/', ...(domain ? { domain } : {}) });
    }
  }
}
