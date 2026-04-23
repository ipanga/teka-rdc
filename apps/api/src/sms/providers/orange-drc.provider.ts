import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  SmsProvider,
  SmsSendResult,
} from '../interfaces/sms-provider.interface';

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

@Injectable()
export class OrangeDrcSmsProvider implements SmsProvider {
  readonly name = 'orange';
  private readonly logger = new Logger(OrangeDrcSmsProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly senderAddress: string;
  private readonly apiBase: string;
  private tokenCache: CachedToken | null = null;

  constructor(configService: ConfigService) {
    this.clientId = configService.get<string>('ORANGE_CLIENT_ID', '');
    this.clientSecret = configService.get<string>('ORANGE_CLIENT_SECRET', '');
    this.senderAddress = configService.get<string>('ORANGE_SENDER_ADDRESS', '');
    this.apiBase = configService.get<string>(
      'ORANGE_API_BASE',
      'https://api.orange.com',
    );
  }

  async sendSms(phone: string, message: string): Promise<SmsSendResult> {
    if (!this.clientId || !this.clientSecret || !this.senderAddress) {
      this.logger.warn('Orange SMS credentials not configured. SMS not sent.');
      return { ok: false, error: 'orange_credentials_missing' };
    }

    try {
      const result = await this.doSend(phone, message, false);
      if (!result.ok && result.error === 'unauthorized') {
        this.tokenCache = null;
        return this.doSend(phone, message, true);
      }
      return result;
    } catch (error) {
      this.logger.error(
        `Orange SMS send failed for ${phone}`,
        error instanceof Error ? error.message : error,
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'unknown',
      };
    }
  }

  private async doSend(
    phone: string,
    message: string,
    isRetry: boolean,
  ): Promise<SmsSendResult> {
    const token = await this.getAccessToken();
    const url = `${this.apiBase}/smsmessaging/v1/outbound/${encodeURIComponent(
      this.senderAddress,
    )}/requests`;

    const receiverAddress = phone.startsWith('tel:') ? phone : `tel:${phone}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        outboundSMSMessageRequest: {
          address: [receiverAddress],
          senderAddress: this.senderAddress,
          outboundSMSTextMessage: { message },
        },
      }),
    });

    if (response.status === 401 && !isRetry) {
      return { ok: false, error: 'unauthorized' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(
        `Orange SMS API error: ${response.status} - ${errorText}`,
      );
      return { ok: false, error: `HTTP ${response.status}` };
    }

    const data: {
      outboundSMSMessageRequest?: { resourceURL?: string };
    } = await response.json();
    const resourceURL = data.outboundSMSMessageRequest?.resourceURL;
    const messageId = resourceURL?.split('/').pop();
    this.logger.log(
      `SMS sent to ${phone} via Orange DRC: ${messageId ?? 'ok'}`,
    );
    return { ok: true, messageId };
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && now < this.tokenCache.expiresAt - 60_000) {
      return this.tokenCache.accessToken;
    }

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString(
      'base64',
    );
    const response = await fetch(`${this.apiBase}/oauth/v3/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Orange OAuth token request failed: ${response.status} - ${errorText}`,
      );
    }

    const data: { access_token: string; expires_in: number } =
      await response.json();
    this.tokenCache = {
      accessToken: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return data.access_token;
  }
}
