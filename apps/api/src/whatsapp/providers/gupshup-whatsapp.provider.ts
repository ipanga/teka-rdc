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

    // Authentication-template binding for Gupshup's /wa/api/v1/template/msg.
    //
    // The template has two placeholders that both render `{{1}}` in WhatsApp:
    // one in the body ("Votre code de vérification est {{1}}") and one in
    // the COPY_CODE button (its copied text). Gupshup's `params` shorthand
    // fills placeholders in their order of occurrence in the template
    // definition — so to fill BOTH we must pass the OTP twice:
    //   params: [code /* body */, code /* COPY_CODE button */]
    //
    // History:
    //   - PR #74 sent only `params: [code]` plus a Meta-spec `components`
    //     array. The body filled (params[0]) but the button kept the
    //     literal `{{1}}` (rendered as `{}`) — Gupshup's v1 endpoint
    //     silently ignores `components`. Confirmed by user paste-test.
    //   - This PR drops `components` and uses the duplicated-params form,
    //     which is the documented behaviour of `params` per Gupshup
    //     ("Array of placeholders/variables in the template in the order
    //     of occurrence").
    const templatePayload = {
      id: this.otpTemplateId,
      params: [code, code],
    };

    const body = new URLSearchParams({
      channel: 'whatsapp',
      source,
      destination,
      'src.name': this.appName,
      template: JSON.stringify(templatePayload),
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
