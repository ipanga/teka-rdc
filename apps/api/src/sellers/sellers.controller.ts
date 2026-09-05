import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SellersService } from './sellers.service';
import { ApplySellerDto } from './dto/apply-seller.dto';
import { UpdateSellerProfileDto } from './dto/update-seller-profile.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { documentMaxBytesFromEnv } from '../seller-verification/seller-document-storage.service';

@Controller('v1/sellers')
export class SellersController {
  constructor(private sellersService: SellersService) {}

  // Upload the KYC document (ID/RCCM photo) BEFORE submitting the application.
  // Returns the Cloudinary public_id to pass as idDocumentCloudinaryId in the
  // apply body. Same role set as apply (fresh registrations are role SELLER).
  @Post('documents')
  @Roles('BUYER', 'SELLER')
  // multer `limits` reject an oversized body while it streams — nothing
  // above the cap is ever buffered (PR 2 hardening).
  @UseInterceptors(
    FileInterceptor('document', {
      limits: { fileSize: documentMaxBytesFromEnv(), files: 1, fields: 2 },
    }),
  )
  async uploadDocument(@UploadedFile() file: Express.Multer.File) {
    return this.sellersService.uploadDocument(file);
  }

  // Accepts BUYER (an existing buyer becoming a seller) AND SELLER (a fresh
  // email registration — register/email assigns role SELLER immediately but
  // creates no SellerProfile, so the applicant is a seller-without-profile).
  // Product creation stays gated on applicationStatus === 'APPROVED', so a
  // role-SELLER user without an approved profile is inert until reviewed.
  @Post('apply')
  @Roles('BUYER', 'SELLER')
  async apply(
    @CurrentUser('userId') userId: string,
    @Body() dto: ApplySellerDto,
  ) {
    return this.sellersService.apply(userId, dto);
  }

  @Get('application')
  async getApplication(@CurrentUser('userId') userId: string) {
    return this.sellersService.getApplication(userId);
  }

  @Get('profile')
  @Roles('SELLER')
  async getProfile(@CurrentUser('userId') userId: string) {
    return this.sellersService.getProfile(userId);
  }

  @Patch('profile')
  @Roles('SELLER')
  async updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateSellerProfileDto,
  ) {
    return this.sellersService.updateProfile(userId, dto);
  }
}
