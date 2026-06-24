import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AdminProductsService } from './admin-products.service';
import { RejectProductDto } from './dto/reject-product.dto';
import { SuspendProductDto } from './dto/suspend-product.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('v1/admin/products')
@Roles('ADMIN')
export class AdminProductsController {
  constructor(private adminProductsService: AdminProductsService) {}

  @Get()
  async findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.adminProductsService.findProducts(
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
      status,
      search,
    );
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProductsService.findProductForReview(id);
  }

  @Get(':id/history')
  async history(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProductsService.getStatusHistory(id);
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

  // Admin takedown of a published product (ACTIVE → SUSPENDED).
  @Patch(':id/suspend')
  async suspend(
    @CurrentUser('userId') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuspendProductDto,
  ) {
    return this.adminProductsService.suspendProduct(id, adminId, dto.reason);
  }

  // Reactivate a SUSPENDED or ARCHIVED product (→ ACTIVE).
  @Patch(':id/restore')
  async restore(
    @CurrentUser('userId') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminProductsService.restoreProduct(id, adminId);
  }

  // Admin archive (→ ARCHIVED).
  @Patch(':id/archive')
  async archive(
    @CurrentUser('userId') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminProductsService.archiveProduct(id, adminId);
  }

  // Reversible soft-delete (sets deletedAt).
  @Delete(':id')
  async softDelete(
    @CurrentUser('userId') adminId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminProductsService.softDeleteProduct(id, adminId);
  }

  @Delete(':id/hard')
  async hardDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminProductsService.hardDeleteProduct(id);
  }
}
