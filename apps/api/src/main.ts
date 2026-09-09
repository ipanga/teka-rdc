// MUST be the first import — see ./instrument.ts. Sentry's SDK monkey-
// patches node primitives at init time; importing it later means
// auto-instrumentation misses requests issued before init runs.
import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { applyHttpSecurity } from './common/security/http-security';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// BigInt JSON serialization polyfill
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

/**
 * Loud boot-time guard for cross-subdomain cookie config. We learned the hard
 * way on 2026-05-17: the .env.production file on the deploy VPS had no
 * COOKIE_DOMAIN entry, so setAuthCookies fell back to undefined (cookie
 * scoped to api.teka.cd only). teka.cd middleware then never saw the auth
 * cookies and bounced every authenticated buyer to /connexion. Three PRs
 * shipped correct code that was silently inert because of this drift.
 *
 * Catch the misconfig at boot, not after users complain.
 */
function assertProductionCookieDomain() {
  if (process.env.NODE_ENV !== 'production') return;
  const cookieDomain = process.env.COOKIE_DOMAIN;
  if (!cookieDomain) {
    console.error(
      '\n══════════════════════════════════════════════════════════════════\n' +
        '  [BOOT] FATAL: COOKIE_DOMAIN is not set in production.\n' +
        '  Auth cookies will be scoped to the request host only, breaking\n' +
        '  cross-subdomain auth (e.g. teka.cd middleware cannot see cookies\n' +
        '  set by api.teka.cd). Add `COOKIE_DOMAIN=.teka.cd` to .env.production\n' +
        '  and restart this container.\n' +
        '══════════════════════════════════════════════════════════════════\n',
    );
    process.exit(1);
  }
  if (!cookieDomain.startsWith('.')) {
    console.warn(
      '\n[BOOT WARNING] COOKIE_DOMAIN is set to "' +
        cookieDomain +
        '" — for cross-subdomain auth it must start with a leading dot ' +
        '(e.g. ".teka.cd"). Continuing anyway, but auth may not work across subdomains.\n',
    );
  }
}

async function bootstrap() {
  assertProductionCookieDomain();
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Trust the single nginx hop in front of the API so `req.ip` returns the
  // real client IP from X-Forwarded-For instead of the proxy's docker IP.
  // Phase 7b (#140) exposed sessions to users, and without this every row's
  // IP rendered as `::ffff:172.18.0.x` (nginx's internal docker address).
  // `1` = trust exactly one hop, which matches our nginx → api topology.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Security headers + private-response caching (shared with the e2e app).
  applyHttpSecurity(app);
  app.use(compression());
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || [
      'http://localhost:5000',
      'http://localhost:5001',
      'http://localhost:5100',
      'http://localhost:5200',
      'http://localhost:8080',
    ],
    credentials: true,
    // `X-Teka-Surface` is still sent by every web api-client (kept allow-listed
    // so preflights keep passing) but since D2a it is telemetry only: the
    // session namespace is bound to the request Origin + the stored role
    // (auth/surface.util.ts). CORS is not an authorization mechanism here —
    // it only decides which browser origins may READ responses.
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Teka-Surface'],
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Response wrapper & error handler
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.API_PORT || 5050;
  await app.listen(port);
  console.log(`Teka RDC API running on port ${port}`);
}
bootstrap();
