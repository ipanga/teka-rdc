import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminProductsService } from './admin-products.service';
import { RejectProductDto } from './dto/reject-product.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/products')
@Roles('ADMIN')
export class AdminProductsController {
  constructor(private adminProductsService: AdminProductsService) {}

  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
  ) {
    return this.adminProductsService.findProducts(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      status,
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProductsService.findProductForReview(id);
  }

  @Patch(':id/approve')
  async approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProductsService.approveProduct(id);
  }

  @Patch(':id/reject')
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectProductDto,
  ) {
    return this.adminProductsService.rejectProduct(id, dto.rejectionReason);
  }

  @Delete(':id/hard')
  async hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProductsService.hardDeleteProduct(id);
  }
}
