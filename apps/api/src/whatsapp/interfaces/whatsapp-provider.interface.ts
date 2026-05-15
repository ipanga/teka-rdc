export interface WhatsappSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsappProvider {
  readonly name: string;
  sendOtpTemplate(phone: string, code: string): Promise<WhatsappSendResult>;
}

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');
