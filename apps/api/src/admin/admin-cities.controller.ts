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
import { Roles } from '../common/decorators/roles.decorator';
import { CitiesService } from '../cities/cities.service';
import { CreateCityDto, UpdateCityDto, CreateCommuneDto, UpdateCommuneDto } from '../cities/dto/create-city.dto';

@Controller('v1/admin/cities')
@Roles('ADMIN')
export class AdminCitiesController {
  constructor(private citiesService: CitiesService) {}

  @Get()
  async getAllCities() {
    return this.citiesService.getAllCities();
  }

  @Post()
  async createCity(@Body() dto: CreateCityDto) {
    return this.citiesService.createCity(dto);
  }

  @Patch(':id')
  async updateCity(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCityDto,
  ) {
    return this.citiesService.updateCity(id, dto);
  }

  @Get(':id/communes')
  async getCommunes(@Param('id', ParseUUIDPipe) id: string) {
    return this.citiesService.getCommunesByCityId(id);
  }

  @Post(':id/communes')
  async createCommune(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommuneDto,
  ) {
    return this.citiesService.createCommune(id, dto);
  }

  @Patch('communes/:communeId')
  async updateCommune(
    @Param('communeId', ParseUUIDPipe) communeId: string,
    @Body() dto: UpdateCommuneDto,
  ) {
    return this.citiesService.updateCommune(communeId, dto);
  }

  @Delete('communes/:communeId')
  async deleteCommune(@Param('communeId', ParseUUIDPipe) communeId: string) {
    return this.citiesService.deleteCommune(communeId);
  }
}
