import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CitiesService } from './cities.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/cities')
export class CitiesController {
  constructor(private citiesService: CitiesService) {}

  @Get()
  @Public()
  async getActiveCities() {
    return this.citiesService.getActiveCities();
  }

  @Get(':id/communes')
  @Public()
  async getCommunes(@Param('id', ParseUUIDPipe) id: string) {
    return this.citiesService.getCommunesByCityId(id);
  }
}
