import { Body, Controller, HttpCode, HttpStatus, Ip, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ContactService } from './contact.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Controller('v1/contact')
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * POST /api/v1/contact — public, tightly rate-limited.
   *
   * Per-IP quota: 5 submissions per hour. The global ThrottlerGuard still
   * applies (100/min) on top; this is the stricter floor for this endpoint.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  async submit(@Body() dto: CreateContactDto, @Ip() ip: string) {
    return this.contact.submit(dto, ip);
  }
}
