export interface SmsSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(phone: string, message: string): Promise<SmsSendResult>;
}

export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
