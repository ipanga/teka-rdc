import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Accept a public contact submission. Returns a generic success shape so
   * the API response looks identical whether the honeypot was filled or not
   * (bots can't distinguish "accepted" from "silently dropped").
   */
  async submit(
    dto: CreateContactDto,
    ipAddress: string | undefined,
  ): Promise<{ ok: true }> {
    if (dto.website && dto.website.trim().length > 0) {
      this.logger.warn(
        `Honeypot tripped on contact form from ${ipAddress ?? 'unknown-ip'}`,
      );
      return { ok: true };
    }

    const recipient =
      this.config.get<string>('CONTACT_FORM_RECIPIENT') ||
      this.config.get<string>('EMAIL_FROM') ||
      'support@teka.cd';

    // Fire-and-forget so a slow Resend request doesn't tie up the request.
    // Errors are surfaced to logs but not to the user — any server error
    // would leak which inputs looked "real" vs "spam".
    this.email
      .sendContactNotification({
        to: recipient,
        replyTo: dto.email,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        subject: dto.subject,
        message: dto.message,
        ipAddress,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to forward contact submission from ${dto.email}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      });

    return { ok: true };
  }
}
