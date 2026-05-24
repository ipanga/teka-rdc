// Next.js 15 instrumentation hook. Loaded once at server start; delegates
// to the appropriate Sentry config based on the active runtime.
//
// Required by @sentry/nextjs v8+ — see https://docs.sentry.io/platforms/javascript/guides/nextjs/.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
