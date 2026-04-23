import { Logger } from '@nestjs/common';
import {
  PaymentProvider,
  InitiatePaymentInput,
  InitiatePaymentResult,
  WebhookPayload,
} from '../interfaces/payment-provider.interface';
import { randomUUID } from 'crypto';

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockPaymentProvider.name);
  private readonly pendingPayments = new Map<string, InitiatePaymentInput>();

  async initiatePayment(
    input: InitiatePaymentInput,
  ): Promise<InitiatePaymentResult> {
    const externalReference = `MOCK-${randomUUID().slice(0, 8).toUpperCase()}`;

    this.pendingPayments.set(externalReference, input);
    this.logger.log(
      `[MOCK] Payment initiated: ref=${externalReference}, amount=${input.amountCDF}, phone=${input.payerPhone}, provider=${input.provider}`,
    );

    // Auto-expire after 5 minutes
    setTimeout(
      () => this.pendingPayments.delete(externalReference),
      5 * 60 * 1000,
    );

    return {
      externalReference,
      status: 'PENDING',
      rawResponse: { mock: true, ref: externalReference },
    };
  }

  verifyWebhookSignature(_rawBody: string, _signature: string): boolean {
    return true; // Always valid in mock mode
  }

  parseWebhookPayload(rawBody: unknown): WebhookPayload {
    const body = rawBody as Record<string, unknown>;
    return {
      externalReference: String(
        body.externalReference ?? body.orderNumber ?? '',
      ),
      status: body.status === 'FAILED' ? 'FAILED' : 'COMPLETED',
      amountPaid: body.amount ? Number(body.amount) : undefined,
      rawBody,
    };
  }

  /** For testing: simulate a successful payment callback */
  simulateSuccess(externalReference: string): WebhookPayload {
    const input = this.pendingPayments.get(externalReference);
    this.pendingPayments.delete(externalReference);
    return {
      externalReference,
      status: 'COMPLETED',
      amountPaid: input ? Number(input.amountCDF / BigInt(100)) : 0,
      rawBody: { mock: true, simulated: 'success' },
    };
  }

  /** For testing: simulate a failed payment callback */
  simulateFailure(externalReference: string): WebhookPayload {
    this.pendingPayments.delete(externalReference);
    return {
      externalReference,
      status: 'FAILED',
      rawBody: { mock: true, simulated: 'failure' },
    };
  }
}
