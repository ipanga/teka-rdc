import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  API_PORT: Joi.number().default(5050),
  DATABASE_URL: Joi.string().required(),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
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

  // SMS (Africa's Talking)
  AT_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  AT_USERNAME: Joi.string().default('teka_rdc'),
  AT_SENDER_ID: Joi.string().default('TekaRDC'),

  // OTP
  OTP_EXPIRY_MINUTES: Joi.number().default(5),

  // Email (Resend)
  RESEND_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  EMAIL_FROM: Joi.string().default('Teka RDC <noreply@teka.cd>'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: Joi.string().default(''),
  CLOUDINARY_API_KEY: Joi.string().default(''),
  CLOUDINARY_API_SECRET: Joi.string().default(''),

  // Payment (Flexpay Mobile Money)
  FLEXPAY_API_URL: Joi.string().default('https://backend.flexpay.cd/api/rest/v1'),
  FLEXPAY_API_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  FLEXPAY_MERCHANT_ID: Joi.string().default(''),
  FLEXPAY_CALLBACK_URL: Joi.string().default(
    'http://localhost:5050/api/v1/payments/webhook/flexpay',
  ),
  FLEXPAY_WEBHOOK_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().default('dev-webhook-secret'),
  }),
  PAYMENT_MOCK_MODE: Joi.boolean().default(true),
});
