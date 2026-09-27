import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { BrowseService } from './browse.service';
import { BrowseProductsQueryDto } from './dto/browse-products-query.dto';
import { BrowseCategoriesQueryDto } from './dto/browse-categories-query.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/browse')
export class BrowseController {
  constructor(private browseService: BrowseService) {}

  @Get('categories')
  @Public()
  getCategories(@Query() query: BrowseCategoriesQueryDto) {
    return this.browseService.getCategories(query.cityId);
  }

  /**
   * Seller category search: ranked LEAF categories (product types) matching
   * the name, the full path, invisible aliases or a linked brand. Declared
   * before `categories/:identifier` so « search » is not read as a slug.
   * Same burst allowance as autocomplete (debounced per keystroke).
   */
  @Get('categories/search')
  @Public()
  @Throttle({ default: { limit: 40, ttl: 10000 } })
  searchCategories(@Query('q') q?: unknown, @Query('limit') limit?: unknown) {
    // A repeated parameter (?q=a&q=b) arrives as an ARRAY: accept strings only,
    // so a tampered query degrades to "no results" instead of a type confusion.
    const text = typeof q === 'string' ? q.slice(0, 100) : '';
    const n = typeof limit === 'string' ? parseInt(limit, 10) : NaN;
    return this.browseService.searchCategories(text, Number.isFinite(n) ? n : 20);
  }

  /**
   * Detail page for a category. Accepts a UUID OR a slug — buyer-web routes
   * via /categorie/<slug>; older /categories/<uuid> links keep working.
   */
  @Get('categories/:identifier')
  @Public()
  getCategoryDetail(
    @Param('identifier') identifier: string,
    @Query() query: BrowseCategoriesQueryDto,
  ) {
    return this.browseService.getCategoryDetail(identifier, query.cityId);
  }

  @Get('products')
  @Public()
  browseProducts(@Query() query: BrowseProductsQueryDto) {
    return this.browseService.browseProducts(query);
  }

  /**
   * Search autocomplete: top relevant products + matching categories for a
   * partial query. City-scoped products when cityId is provided.
   */
  // Burst-friendly but abuse-resistant: autocomplete fires per keystroke
  // (debounced), so allow 40 hits / 10s per IP — comfortably covers fast typing
  // while blocking scripted scraping.
  @Get('search/suggestions')
  @Public()
  @Throttle({ default: { limit: 40, ttl: 10000 } })
  searchSuggestions(@Query('q') q?: string, @Query('cityId') cityId?: string) {
    return this.browseService.searchSuggestions(q ?? '', cityId);
  }

  /**
   * Popular searches for the empty/focused autocomplete state — top non-zero
   * terms over the last 7 days, optionally city-scoped.
   */
  @Get('search/popular')
  @Public()
  getPopularSearches(@Query('cityId') cityId?: string) {
    return this.browseService.getPopularSearches(cityId);
  }

  @Get('products/:identifier')
  @Public()
  getProductDetail(@Param('identifier') identifier: string) {
    return this.browseService.getProductDetail(identifier);
  }

  /** Related products for the PDP (same category + price proximity). */
  @Get('products/:id/related')
  @Public()
  getRelatedProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.browseService.getRelatedProducts(
      id,
      limit ? parseInt(limit, 10) : undefined,
    );
  }

  @Get('categories/:id/attributes')
  @Public()
  getCategoryAttributes(@Param('id', ParseUUIDPipe) id: string) {
    return this.browseService.getCategoryAttributes(id);
  }
}
