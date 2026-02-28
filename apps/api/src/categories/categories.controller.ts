import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/categories')
@Roles('ADMIN')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  @Get()
  findTree() {
    return this.categoriesService.findTree();
  }

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get(':id')
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.findById(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoriesService.softDelete(id);
  }

  @Post(':id/attributes')
  createAttribute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAttributeDto,
  ) {
    return this.categoriesService.createAttribute(id, dto);
  }

  @Patch(':id/attributes/:attrId')
  updateAttribute(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attrId', ParseUUIDPipe) attrId: string,
    @Body() dto: CreateAttributeDto,
  ) {
    return this.categoriesService.updateAttribute(id, attrId, dto);
  }

  @Delete(':id/attributes/:attrId')
  deleteAttribute(@Param('attrId', ParseUUIDPipe) attrId: string) {
    return this.categoriesService.deleteAttribute(attrId);
  }
}
