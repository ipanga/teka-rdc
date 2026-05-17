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

  it('duplicates the OTP in params so both body and COPY_CODE button bind', async () => {
    // Regression: PR #74 sent only `params: [code]` plus a Meta-spec
    // `components` array — Gupshup's v1 endpoint silently ignored
    // `components`, the body filled but the COPY_CODE button kept the
    // literal `{{1}}` placeholder (rendered as `{}` in the WhatsApp
    // client), so tapping "Copier le code" copied empty braces.
    //
    // This test enforces the working shape: `params: [code, code]`. The
    // template definition has two `{{1}}` placeholders (one in the body,
    // one in the COPY_CODE button text), and Gupshup fills them in
    // order-of-occurrence — so we pass the OTP twice.
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
    expect(tpl.params).toEqual(['654321', '654321']);
    // Components were tried in PR #74 and ignored by Gupshup — make sure
    // we don't accidentally regress to that pattern.
    expect(tpl.components).toBeUndefined();
  });
});
