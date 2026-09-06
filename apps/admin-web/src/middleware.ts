import { NextRequest, NextResponse } from 'next/server';
import { buildPortalCsp, generateNonce } from '@/lib/security-headers';

const protectedRoutes = ['/dashboard'];
const robotsHeader = 'noindex, nofollow, noarchive';

/**
 * Per-request CSP (D4). The nonce travels to the React renderer through the
 * request's `content-security-policy` header — Next.js reads it from there
 * and stamps every framework script — and back to the browser on the
 * response. Everything this portal serves is either a login page or an
 * authenticated page, so every HTML response is also `private, no-store`.
 */
function secure(request: NextRequest, response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Robots-Tag', robotsHeader);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = generateNonce();
  const csp = buildPortalCsp(nonce, {
    apiUrl: process.env.NEXT_PUBLIC_API_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN_ADMIN_WEB,
    dev: process.env.NODE_ENV !== 'production',
  });

  const hasSession =
    request.cookies.has('teka_admin_access_token') ||
    request.cookies.has('teka_admin_refresh_token');

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', pathname);
    return secure(request, NextResponse.redirect(loginUrl), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  return secure(request, NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
