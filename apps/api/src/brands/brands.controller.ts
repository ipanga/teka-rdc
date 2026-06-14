import { Controller, Get, Query } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/brands')
export class BrandsController {
  constructor(private brandsService: BrandsService) {}

  /**
   * Active brands, optionally scoped to a (sub)category. Powers the seller
   * form brand dropdown and the buyer brand-filter facet. Public — no
   * hardcoded brand lists in any frontend.
   */
  @Get()
  @Public()
  async getBrands(@Query('categoryId') categoryId?: string) {
    return this.brandsService.getActiveBrands(categoryId);
  }
}
