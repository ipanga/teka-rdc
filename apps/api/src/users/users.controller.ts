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
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/users')
export class UsersController {
  constructor(private usersService: UsersService) {}

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
}
