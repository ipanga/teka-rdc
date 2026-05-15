import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  WhatsappProvider,
  WhatsappSendResult,
} from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class GupshupWhatsappProvider implements WhatsappProvider {
  readonly name = 'gupshup';
  private readonly logger = new Logger(GupshupWhatsappProvider.name);
  private readonly apiKey: string;
  private readonly appName: string;
  private readonly sourceNumber: string;
  private readonly apiBase: string;
  private readonly otpTemplateId: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('GUPSHUP_API_KEY', '');
    this.appName = configService.get<string>('GUPSHUP_APP_NAME', '');
    this.sourceNumber = configService.get<string>('GUPSHUP_SOURCE_NUMBER', '');
    // Default to the /wa/ (WhatsApp Business) API path. The older /sm/
    // (social messaging) path returns 401 "Portal User Not Found With
    // APIKey" for accounts on Gupshup's newer app-level partner tokens.
    this.apiBase = configService.get<string>(
      'GUPSHUP_BASE_URL',
      'https://api.gupshup.io/wa/api/v1',
    );
    this.otpTemplateId = configService.get<string>(
      'GUPSHUP_OTP_TEMPLATE_ID',
      '',
    );
  }

  async sendOtpTemplate(
    phone: string,
    code: string,
  ): Promise<WhatsappSendResult> {
    if (
      !this.apiKey ||
      !this.sourceNumber ||
      !this.otpTemplateId ||
      !this.appName
    ) {
      this.logger.warn(
        'Gupshup credentials not configured. WhatsApp OTP not sent.',
      );
      return { ok: false, error: 'gupshup_credentials_missing' };
    }

    // Gupshup expects E.164 without the leading "+".
    const destination = phone.replace(/^\+/, '');
    const source = this.sourceNumber.replace(/^\+/, '');

    const body = new URLSearchParams({
      channel: 'whatsapp',
      source,
      destination,
      'src.name': this.appName,
      template: JSON.stringify({ id: this.otpTemplateId, params: [code] }),
    });

    try {
      const response = await fetch(`${this.apiBase}/template/msg`, {
        method: 'POST',
        headers: {
          apikey: this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Gupshup WhatsApp template error: ${response.status} - ${errorText}`,
        );
        return { ok: false, error: `HTTP ${response.status}` };
      }

      const data: { messageId?: string; status?: string } =
        await response.json();
      if (data.status && data.status !== 'submitted') {
        this.logger.warn(
          `Gupshup returned non-submitted status="${data.status}" for ${phone}`,
        );
      }
      this.logger.log(
        `WhatsApp OTP sent to ${phone} via Gupshup: ${data.messageId ?? 'ok'}`,
      );
      return { ok: true, messageId: data.messageId };
    } catch (error) {
      this.logger.error(
        `Gupshup WhatsApp send failed for ${phone}`,
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }
}
