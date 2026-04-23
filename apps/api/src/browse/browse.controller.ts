import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { BrowseService } from './browse.service';
import { BrowseProductsQueryDto } from './dto/browse-products-query.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/browse')
export class BrowseController {
  constructor(private browseService: BrowseService) {}

  @Get('categories')
  @Public()
  getCategories() {
    return this.browseService.getCategories();
  }

  @Get('products')
  @Public()
  browseProducts(@Query() query: BrowseProductsQueryDto) {
    return this.browseService.browseProducts(query);
  }

  @Get('products/:identifier')
  @Public()
  getProductDetail(@Param('identifier') identifier: string) {
    return this.browseService.getProductDetail(identifier);
  }

  @Get('categories/:id/attributes')
  @Public()
  getCategoryAttributes(@Param('id', ParseUUIDPipe) id: string) {
    return this.browseService.getCategoryAttributes(id);
  }
}
