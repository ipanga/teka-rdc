import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

/**
 * HTTP security for the JSON API (D4, 2026-09-06). Applied identically by
 * main.ts and the e2e test app, so the header contract is what the tests
 * assert.
 *
 * - The API never renders HTML, so its CSP is the smallest honest policy
 *   (`default-src 'none'` + no framing) rather than helmet's browser-page
 *   default, which listed script/style sources that mean nothing here.
 * - HSTS is deliberately NOT emitted by the app: TLS terminates at nginx
 *   (behind Cloudflare), which sets one Strict-Transport-Security for every
 *   host. Two differing STS headers on one response is worse than one.
 * - Everything else keeps helmet's defaults: nosniff, no-referrer,
 *   COOP/CORP same-origin (CORS-mode fetches from the web apps are unaffected),
 *   X-Frame-Options, no X-Powered-By.
 */
/** Exactly what helmet serialises (no space after the separator). */
export const API_CSP = "default-src 'none';frame-ancestors 'none';base-uri 'none';form-action 'none'";

export function applyHttpSecurity(app: INestApplication): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
        },
      },
      strictTransportSecurity: false,
    }),
  );
  app.use(noStoreForCredentialedRequests);
}

/**
 * A response to a request that carried a session (cookie or bearer) is
 * personal: orders, addresses, payouts, CSV exports. Mark it `no-store` so
 * neither a shared cache nor the browser's back/forward cache keeps it.
 * Anonymous browse/catalogue responses are left alone (they were never
 * cached either — no validators are sent — but the policy stays theirs).
 */
export function noStoreForCredentialedRequests(req: Request, res: Response, next: NextFunction): void {
  if (req.headers.authorization || req.headers.cookie) {
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
}
