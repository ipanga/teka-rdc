import { Controller, Get, Query } from '@nestjs/common';
import { DeliveryZonesService } from './delivery-zones.service';
import { EstimateFeeQueryDto } from './dto/estimate-fee-query.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/delivery-zones')
export class DeliveryZonesController {
  constructor(private deliveryZonesService: DeliveryZonesService) {}

  @Get('estimate')
  @Public()
  estimateFee(@Query() query: EstimateFeeQueryDto) {
    return this.deliveryZonesService.estimateFee(query.fromTown, query.toTown);
  }
}
