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
import { multipartFieldNameLimits } from '../common/uploads/image-upload';
import { Throttle } from '@nestjs/throttler';
import { IdentityThrottle } from '../common/rate-limit/identity-throttle.decorator';

@Controller('v1/sellers')
export class SellersController {
  constructor(private sellersService: SellersService) {}

  // Upload the KYC document (ID/RCCM photo) BEFORE submitting the application.
  // Returns the Cloudinary public_id to pass as idDocumentCloudinaryId in the
  // apply body. Same role set as apply (fresh registrations are role SELLER).
  @Post('documents')
  @Roles('BUYER', 'SELLER')
  // S13 (2026-09-09): this route creates a PRIVATE Cloudinary asset per call
  // and is open to any authenticated BUYER, with no row and no owner binding —
  // so without a throttle a single account could mint unbounded private
  // storage. Same budget as the other upload routes (AUTH_LIMITS.upload,
  // 30 / 10 min per user) plus a per-IP cap; a legitimate applicant uploads
  // one or two documents.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @IdentityThrottle('upload')
  // multer `limits` reject an oversized body while it streams — nothing
  // above the cap is ever buffered (PR 2 hardening).
  @UseInterceptors(
    FileInterceptor('document', {
      limits: {
        fileSize: documentMaxBytesFromEnv(),
        files: 1,
        fields: 2,
        ...multipartFieldNameLimits,
      },
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
