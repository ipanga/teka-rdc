import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  API_PORT: Joi.number().default(5050),
  DATABASE_URL: Joi.string().required(),
  JWT_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('dev-jwt-secret-not-for-production'),
  }),
  JWT_REFRESH_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('dev-refresh-secret-not-for-production'),
  }),
  JWT_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  CORS_ORIGINS: Joi.string().default(
    'http://localhost:5000,http://localhost:5100,http://localhost:5200',
  ),

  // OTP (used by buyer WhatsApp OTP auth — restored 2026-05-15)
  OTP_EXPIRY_MINUTES: Joi.number().default(5),

  // WhatsApp (buyer OTP auth via Gupshup, 2026-05-15)
  WHATSAPP_PROVIDER: Joi.string().valid('gupshup', 'mock').default('mock'),
  GUPSHUP_API_KEY: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'gupshup',
    then: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().allow('').default(''),
    }),
    otherwise: Joi.string().allow('').default(''),
  }),
  GUPSHUP_APP_NAME: Joi.string().allow('').default(''),
  GUPSHUP_SOURCE_NUMBER: Joi.string().allow('').default(''),
  GUPSHUP_BASE_URL: Joi.string().default('https://api.gupshup.io/wa/api/v1'),
  GUPSHUP_OTP_TEMPLATE_ID: Joi.string().when('WHATSAPP_PROVIDER', {
    is: 'gupshup',
    then: Joi.when('NODE_ENV', {
      is: 'production',
      then: Joi.required(),
      otherwise: Joi.string().allow('').default(''),
    }),
    otherwise: Joi.string().allow('').default(''),
  }),

  // Email (Resend)
  RESEND_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  EMAIL_FROM: Joi.string().default('Teka RDC <noreply@teka.cd>'),

  // Recipient for contact-form submissions. Defaults to the EMAIL_FROM
  // address; operators can override to route to a support distribution list.
  CONTACT_FORM_RECIPIENT: Joi.string().email().optional().allow(''),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: Joi.string().default(''),
  CLOUDINARY_API_KEY: Joi.string().default(''),
  CLOUDINARY_API_SECRET: Joi.string().default(''),

  // Password hashing & resets
  BCRYPT_ROUNDS: Joi.number().min(10).max(14).default(12),
  PASSWORD_RESET_EXPIRY_MINUTES: Joi.number().default(60),
  SELLER_SETUP_EXPIRY_HOURS: Joi.number().default(24),
  BUYER_SETUP_EXPIRY_HOURS: Joi.number().default(24),

  // Public base URLs (for emails & redirects)
  BUYER_WEB_URL: Joi.string().default('http://localhost:5001'),
  SELLER_WEB_URL: Joi.string().default('http://localhost:5100'),
  ADMIN_WEB_URL: Joi.string().default('http://localhost:5200'),

  // PostHog (server-side product analytics). Server secret — NOT a
  // NEXT_PUBLIC_ var. Empty → PostHogService is a no-op (mirrors
  // SENTRY_DSN). Single prod project; dev left empty so local runs don't
  // pollute prod analytics. POSTHOG_HOST defaults to US Cloud.
  POSTHOG_API_KEY: Joi.string().allow('').default(''),
  POSTHOG_HOST: Joi.string().default('https://us.i.posthog.com'),
});
