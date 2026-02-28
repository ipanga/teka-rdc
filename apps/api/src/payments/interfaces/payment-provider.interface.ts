export interface InitiatePaymentInput {
  orderNumber: string;
  amountCDF: bigint;
  payerPhone: string;
  provider: 'M_PESA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY';
  description: string;
  idempotencyKey: string;
}

export interface InitiatePaymentResult {
  externalReference: string;
  status: 'PENDING' | 'FAILED';
  rawResponse?: unknown;
}

export interface WebhookPayload {
  externalReference: string;
  status: 'COMPLETED' | 'FAILED';
  amountPaid?: number;
  rawBody: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult>;
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  parseWebhookPayload(rawBody: unknown): WebhookPayload;
}
