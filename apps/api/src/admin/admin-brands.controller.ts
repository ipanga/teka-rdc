import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { BrandsService } from '../brands/brands.service';
import { Roles } from '../common/decorators/roles.decorator';
import {
  CreateBrandDto,
  UpdateBrandDto,
  MergeBrandDto,
  SetBrandCategoriesDto,
} from '../brands/dto/brand.dto';

// No ParseUUIDPipe on :id — seeded brands use non-RFC4122 ids (15000000-…)
// that fail isUUID(); BrandsService validates existence via DB lookup.
@Controller('v1/admin/brands')
@Roles('ADMIN')
export class AdminBrandsController {
  constructor(private brandsService: BrandsService) {}

  @Get()
  async findAll() {
    return this.brandsService.getAllBrands();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.brandsService.getBrandById(id);
  }

  @Post()
  async create(@Body() dto: CreateBrandDto) {
    return this.brandsService.createBrand(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.updateBrand(id, dto);
  }

  @Patch(':id/activate')
  async activate(@Param('id') id: string) {
    return this.brandsService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    return this.brandsService.setActive(id, false);
  }

  @Patch(':id/categories')
  async setCategories(
    @Param('id') id: string,
    @Body() dto: SetBrandCategoriesDto,
  ) {
    return this.brandsService.setCategories(id, dto);
  }

  @Post(':id/merge')
  async merge(@Param('id') id: string, @Body() dto: MergeBrandDto) {
    return this.brandsService.mergeBrands(id, dto.targetBrandId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.brandsService.softDelete(id);
  }
}
