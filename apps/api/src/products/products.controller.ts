import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/sellers/products')
@Roles('SELLER')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  create(@CurrentUser('userId') userId: string, @Body() dto: CreateProductDto) {
    return this.productsService.create(userId, dto);
  }

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: ProductQueryDto,
  ) {
    return this.productsService.findSellerProducts(userId, query);
  }

  // Dashboard counts (single grouped query). MUST stay above @Get(':id') so
  // "stats" isn't captured as a product id.
  @Get('stats')
  stats(@CurrentUser('userId') userId: string) {
    return this.productsService.getSellerStats(userId);
  }

  @Get(':id')
  findById(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.findById(userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(userId, id, dto);
  }

  @Delete(':id')
  archive(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.archive(userId, id);
  }

  // Hard-delete. Lives at /hard to make the call site obviously
  // destructive — `DELETE /v1/sellers/products/:id` continues to do the
  // reversible archive. This endpoint purges the Cloudinary assets and
  // removes the Product row outright.
  @Delete(':id/hard')
  hardDelete(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.hardDelete(userId, id);
  }

  @Patch(':id/submit')
  submit(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.submitForReview(userId, id);
  }

  // Withdraw a product from review (PENDING_REVIEW → DRAFT).
  @Patch(':id/withdraw')
  withdraw(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.withdraw(userId, id);
  }

  // Restore an archived product (ARCHIVED → DRAFT).
  @Patch(':id/restore')
  restore(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.restore(userId, id);
  }

  // Duplicate a product into a fresh DRAFT (color/size variants, etc.).
  @Post(':id/duplicate')
  duplicate(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.duplicate(userId, id);
  }

  @Post(':id/images')
  @UseInterceptors(FileInterceptor('image'))
  uploadImage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.productsService.uploadImage(userId, id, file);
  }

  @Delete(':id/images/:imageId')
  deleteImage(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.productsService.deleteImage(userId, id, imageId);
  }
}
