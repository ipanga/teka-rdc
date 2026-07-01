import { NextRequest, NextResponse } from 'next/server';

const protectedRoutes = ['/dashboard'];
const robotsHeader = 'noindex, nofollow';

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Treat the user as authenticated if they hold either an access token
  // (15 min TTL) OR a refresh token (7 day TTL). Mirrors buyer-web
  // middleware (PR #83). Gating on the access token alone bounced
  // logged-in sellers to /login mid-session every 15 min — the refresh
  // token is the real session signal; if it's present, apiFetch will
  // mint a new access token on the next API call.
  const hasSession =
    request.cookies.has('teka_seller_access_token') ||
    request.cookies.has('teka_seller_refresh_token');

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !hasSession) {
    // Use nextUrl.clone() so the basePath (if any) is preserved automatically.
    // Hardcoding `/seller/login` only works in dev where basePath='/seller';
    // in prod the app is served at seller.teka.cd root and the prefix produces
    // a 404 (seller.teka.cd/seller/login).
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', pathname);
    const response = NextResponse.redirect(loginUrl);
    response.headers.set('X-Robots-Tag', robotsHeader);
    return response;
  }

  // NOTE: no authOnly /login → /dashboard redirect on this surface.
  // Cookies are now per-surface (teka_seller_*), so a logged-in buyer/admin
  // on .teka.cd no longer trips this gate. We still render the login form
  // unconditionally and let the dashboard layout do the SELLER role check as
  // defense in depth.

  const response = NextResponse.next();
  response.headers.set('X-Robots-Tag', robotsHeader);
  return response;
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
