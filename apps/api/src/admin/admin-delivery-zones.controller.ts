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
import { DeliveryZonesService } from '../delivery-zones/delivery-zones.service';
import { CreateDeliveryZoneDto } from '../delivery-zones/dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from '../delivery-zones/dto/update-delivery-zone.dto';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('v1/admin/delivery-zones')
@Roles('ADMIN')
export class AdminDeliveryZonesController {
  constructor(private deliveryZonesService: DeliveryZonesService) {}

  @Get()
  findAll() {
    return this.deliveryZonesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateDeliveryZoneDto) {
    return this.deliveryZonesService.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeliveryZoneDto,
  ) {
    return this.deliveryZonesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.deliveryZonesService.remove(id);
  }
}
