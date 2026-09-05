import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { SellerVerificationService } from './seller-verification.service';
import { UploadSellerDocumentDto } from './dto/upload-seller-document.dto';
import { documentMaxBytesFromEnv } from './seller-document-storage.service';

/**
 * Seller-side verification API (D8): a seller reads and uploads evidence for
 * their OWN profile only (resolved from the JWT, never from a parameter) and
 * can never change `verificationStatus` beyond the automatic move to
 * PENDING_REVIEW. The multer `limits` reject an oversized body while it is
 * still streaming — nothing larger than the cap is buffered in memory.
 */
@Controller('v1/sellers/verification')
@Roles('SELLER')
export class SellerVerificationController {
  constructor(private verification: SellerVerificationService) {}

  @Get()
  async getStatus(@CurrentUser('userId') userId: string) {
    return this.verification.getOwnStatus(userId);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('document', {
      limits: { fileSize: documentMaxBytesFromEnv(), files: 1, fields: 4 },
    }),
  )
  async uploadDocument(
    @CurrentUser('userId') userId: string,
    @Body() dto: UploadSellerDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.verification.submitDocument(userId, dto, file);
  }
}
