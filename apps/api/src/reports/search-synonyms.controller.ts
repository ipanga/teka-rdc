import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SearchSynonymsService } from './search-synonyms.service';
import {
  CreateSearchSynonymDto,
  UpdateSearchSynonymDto,
} from './dto/search-synonym.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { UuidParam } from '../common/pipes/uuid-param.pipe';

/**
 * Admin CRUD for search synonym groups.
 *
 * Sits beside the search analytics it is driven from: the « Recherches » page's
 * zero-result table IS the candidate list, so the two belong in one namespace.
 *
 * `@Roles('ADMIN')` is enforced by the global JwtAuthGuard -> RolesGuard chain,
 * so a buyer or seller gets 403 and an anonymous caller 401 on every route.
 */
@Controller('v1/admin/reports/search/synonyms')
@Roles('ADMIN')
export class SearchSynonymsController {
  constructor(private synonyms: SearchSynonymsService) {}

  @Get()
  async findAll() {
    const data = await this.synonyms.findAll();
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id', UuidParam) id: string) {
    return { success: true, data: await this.synonyms.findOne(id) };
  }

  @Post()
  async create(@Body() dto: CreateSearchSynonymDto) {
    return { success: true, data: await this.synonyms.create(dto) };
  }

  @Patch(':id')
  async update(
    @Param('id', UuidParam) id: string,
    @Body() dto: UpdateSearchSynonymDto,
  ) {
    return { success: true, data: await this.synonyms.update(id, dto) };
  }

  /** Reversible off switch — preferred over DELETE for a group in use. */
  @Patch(':id/deactivate')
  async deactivate(@Param('id', UuidParam) id: string) {
    return { success: true, data: await this.synonyms.setActive(id, false) };
  }

  @Patch(':id/activate')
  async activate(@Param('id', UuidParam) id: string) {
    return { success: true, data: await this.synonyms.setActive(id, true) };
  }

  @Delete(':id')
  async remove(@Param('id', UuidParam) id: string) {
    return { success: true, data: await this.synonyms.remove(id) };
  }
}
