import { ConfigService } from '@nestjs/config';
import { GupshupWhatsappProvider } from './gupshup-whatsapp.provider';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    GUPSHUP_API_KEY: 'test-key',
    GUPSHUP_APP_NAME: 'teka_rdc',
    GUPSHUP_SOURCE_NUMBER: '+243990000000',
    GUPSHUP_BASE_URL: 'https://api.gupshup.io/wa/api/v1',
    GUPSHUP_OTP_TEMPLATE_ID: 'tpl-1234',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: string) => defaults[key] ?? fallback ?? '',
  } as unknown as ConfigService;
}

describe('GupshupWhatsappProvider', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('refuses to call the API when credentials are missing', async () => {
    const provider = new GupshupWhatsappProvider(
      makeConfig({ GUPSHUP_API_KEY: '' }),
    );

    const result = await provider.sendOtpTemplate('+243999000001', '123456');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('gupshup_credentials_missing');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('strips the leading + from the destination phone', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'gs-1', status: 'submitted' }), {
        status: 200,
      }),
    );
    const provider = new GupshupWhatsappProvider(makeConfig());

    await provider.sendOtpTemplate('+243999000001', '123456');

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    expect(body).toContain('destination=243999000001');
    expect(body).not.toContain('destination=%2B243');
    expect(body).toContain('source=243990000000');
  });

  it('parses messageId on success', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ messageId: 'gs-42', status: 'submitted' }),
        {
          status: 200,
        },
      ),
    );
    const provider = new GupshupWhatsappProvider(makeConfig());

    const result = await provider.sendOtpTemplate('+243999000001', '999999');

    expect(result.ok).toBe(true);
    expect(result.messageId).toBe('gs-42');
  });

  it('returns ok=false on HTTP 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('Bad Request', { status: 400 }));
    const provider = new GupshupWhatsappProvider(makeConfig());

    const result = await provider.sendOtpTemplate('+243999000001', '123456');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('HTTP 400');
  });

  it('returns ok=false when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const provider = new GupshupWhatsappProvider(makeConfig());

    const result = await provider.sendOtpTemplate('+243999000001', '123456');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('network down');
  });

  it('binds the OTP to both the body and the COPY_CODE button', async () => {
    // Regression: without the explicit `button` component, the COPY_CODE
    // button in the WhatsApp authentication template copied the literal
    // `{{1}}` placeholder (rendered as `{}` in some clients) instead of
    // the OTP value. The fix sends a Meta-spec `components` array binding
    // the same OTP to both the body and the button.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ messageId: 'gs-1', status: 'submitted' }), {
        status: 200,
      }),
    );
    const provider = new GupshupWhatsappProvider(makeConfig());

    await provider.sendOtpTemplate('+243999000001', '654321');

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
    const params = new URLSearchParams(body);
    const tpl = JSON.parse(params.get('template') ?? '{}');

    expect(tpl.id).toBe('tpl-1234');
    expect(tpl.components).toEqual([
      {
        type: 'body',
        parameters: [{ type: 'text', text: '654321' }],
      },
      {
        type: 'button',
        sub_type: 'copy_code',
        index: 0,
        parameters: [{ type: 'coupon_code', coupon_code: '654321' }],
      },
    ]);
  });
});
