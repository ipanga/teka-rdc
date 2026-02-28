import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/addresses')
export class AddressesController {
  constructor(private addressesService: AddressesService) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.addressesService.findAll(userId);
  }

  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.addressesService.create(userId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(userId, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addressesService.remove(userId, id);
  }

  @Patch(':id/default')
  async setDefault(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.addressesService.setDefault(userId, id);
  }

  @Public()
  @Get('locations/towns')
  async getTowns() {
    return this.addressesService.getTowns();
  }

  @Public()
  @Get('locations/neighborhoods')
  async getNeighborhoods(@Query('town') town: string) {
    return this.addressesService.getNeighborhoods(town);
  }
}
