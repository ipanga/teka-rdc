import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  WebhookPayload,
} from '../interfaces/payment-provider.interface';
import { createHmac } from 'crypto';

/** Maps our provider enum to Flexpay type codes */
const PROVIDER_TYPE_MAP: Record<string, number> = {
  M_PESA: 1,
  AIRTEL_MONEY: 2,
  ORANGE_MONEY: 3,
};

export class FlexpayProvider implements PaymentProvider {
  readonly name = 'FLEXPAY';
  private readonly logger = new Logger(FlexpayProvider.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly merchantId: string;
  private readonly webhookSecret: string;

  constructor(configService: ConfigService) {
    this.apiUrl = configService.get<string>('FLEXPAY_API_URL', 'https://backend.flexpay.cd/api/rest/v1');
    this.apiKey = configService.get<string>('FLEXPAY_API_KEY', '');
    this.merchantId = configService.get<string>('FLEXPAY_MERCHANT_ID', '');
    this.webhookSecret = configService.get<string>('FLEXPAY_WEBHOOK_SECRET', '');
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
    const body = {
      merchant: this.merchantId,
      type: PROVIDER_TYPE_MAP[input.provider] ?? 1,
      phone: input.payerPhone.replace('+', ''),
      reference: input.idempotencyKey,
      amount: Number(input.amountCDF / BigInt(100)), // Convert centimes to CDF
      currency: 'CDF',
      callbackUrl: '', // Set by the service from env
      description: input.description,
      orderNumber: input.orderNumber,
    };

    try {
      const response = await fetch(`${this.apiUrl}/paymentService`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (data.code === '0' || response.ok) {
        return {
          externalReference: data.orderNumber ?? input.orderNumber,
          status: 'PENDING',
          rawResponse: data,
        };
      }

      this.logger.error(`Flexpay payment initiation failed: ${JSON.stringify(data)}`);
      return {
        externalReference: input.orderNumber,
        status: 'FAILED',
        rawResponse: data,
      };
    } catch (error) {
      this.logger.error(`Flexpay API call failed: ${error}`);
      return {
        externalReference: input.orderNumber,
        status: 'FAILED',
        rawResponse: { error: String(error) },
      };
    }
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    if (!this.webhookSecret) return false;
    const expected = createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex');
    return expected === signature;
  }

  parseWebhookPayload(rawBody: unknown): WebhookPayload {
    const body = rawBody as Record<string, unknown>;
    const code = String(body.code ?? '');
    const isSuccess = code === '0';

    return {
      externalReference: String(body.orderNumber ?? body.reference ?? ''),
      status: isSuccess ? 'COMPLETED' : 'FAILED',
      amountPaid: body.amount ? Number(body.amount) : undefined,
      rawBody,
    };
  }
}
