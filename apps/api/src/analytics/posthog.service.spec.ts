import { ConfigService } from '@nestjs/config';
import { PostHogService } from './posthog.service';

// Mock the posthog-node client. Vars must be `mock`-prefixed to be usable
// inside the jest.mock factory.
const mockCapture = jest.fn();
const mockIdentify = jest.fn();
const mockShutdown = jest.fn().mockResolvedValue(undefined);
const mockCtor = jest.fn();

jest.mock('posthog-node', () => ({
  PostHog: jest.fn().mockImplementation((...args: unknown[]) => {
    mockCtor(...args);
    return {
      capture: mockCapture,
      identify: mockIdentify,
      shutdown: mockShutdown,
    };
  }),
}));

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    POSTHOG_API_KEY: 'phc_test_key',
    POSTHOG_HOST: 'https://us.i.posthog.com',
    ...overrides,
  };
  return {
    get: (key: string, fallback?: string) => defaults[key] ?? fallback ?? '',
  } as unknown as ConfigService;
}

describe('PostHogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when POSTHOG_API_KEY is empty', () => {
    it('stays disabled and never constructs a client', () => {
      const svc = new PostHogService(makeConfig({ POSTHOG_API_KEY: '' }));
      svc.onModuleInit();

      expect(svc.isEnabled()).toBe(false);
      expect(mockCtor).not.toHaveBeenCalled();
    });

    it('makes capture / identify safe no-ops', () => {
      const svc = new PostHogService(makeConfig({ POSTHOG_API_KEY: '' }));
      svc.onModuleInit();

      expect(() =>
        svc.capture('user-1', 'order_created', { total: 5 }),
      ).not.toThrow();
      expect(() => svc.identify('user-1', { role: 'BUYER' })).not.toThrow();
      expect(mockCapture).not.toHaveBeenCalled();
      expect(mockIdentify).not.toHaveBeenCalled();
    });
  });

  describe('when POSTHOG_API_KEY is set', () => {
    it('initializes the client with the configured host', () => {
      const svc = new PostHogService(makeConfig());
      svc.onModuleInit();

      expect(svc.isEnabled()).toBe(true);
      expect(mockCtor).toHaveBeenCalledWith(
        'phc_test_key',
        expect.objectContaining({ host: 'https://us.i.posthog.com' }),
      );
    });

    it('captures events with distinctId, event, and an environment tag', () => {
      const svc = new PostHogService(makeConfig());
      svc.onModuleInit();

      svc.capture('user-1', 'order_created', { total_cdf: 12000 });

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'order_created',
        properties: { total_cdf: 12000, environment: 'test' },
      });
    });

    it('prefers SENTRY_ENVIRONMENT over NODE_ENV for the environment tag', () => {
      const svc = new PostHogService(
        makeConfig({ SENTRY_ENVIRONMENT: 'staging' }),
      );
      svc.onModuleInit();

      svc.capture('user-1', 'user_login');

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'user_login',
        properties: { environment: 'staging' },
      });
    });

    it('scrubs DRC phone numbers out of event properties', () => {
      const svc = new PostHogService(makeConfig());
      svc.onModuleInit();

      svc.capture('user-1', 'note', {
        note: 'call +243812345678 now',
        nested: { ref: 'x +243999000001 y' },
      });

      expect(mockCapture).toHaveBeenCalledWith({
        distinctId: 'user-1',
        event: 'note',
        properties: {
          note: 'call [phone] now',
          nested: { ref: 'x [phone] y' },
          environment: 'test',
        },
      });
    });

    it('identifies a user with the given properties (id + role convention)', () => {
      const svc = new PostHogService(makeConfig());
      svc.onModuleInit();

      svc.identify('user-1', { role: 'SELLER' });

      expect(mockIdentify).toHaveBeenCalledWith({
        distinctId: 'user-1',
        properties: { role: 'SELLER', environment: 'test' },
      });
    });

    it('flushes via shutdown on module destroy', async () => {
      const svc = new PostHogService(makeConfig());
      svc.onModuleInit();

      await svc.onModuleDestroy();

      expect(mockShutdown).toHaveBeenCalledTimes(1);
    });
  });
});
