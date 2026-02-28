import { Controller, Get, Param } from '@nestjs/common';
import { ContentService } from './content.service';
import { Public } from '../common/decorators/public.decorator';

@Controller('v1/content')
@Public()
export class ContentPublicController {
  constructor(private contentService: ContentService) {}

  /**
   * GET /api/v1/content
   * List all published content pages (id, slug, title, sortOrder).
   */
  @Get()
  async getPublishedPagesList() {
    const data = await this.contentService.getPublishedPagesList();
    return { success: true, data };
  }

  /**
   * GET /api/v1/content/:slug
   * Get a published content page by slug.
   */
  @Get(':slug')
  async getPublishedPage(@Param('slug') slug: string) {
    const data = await this.contentService.getPublishedPage(slug);
    return { success: true, data };
  }
}
