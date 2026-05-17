import { NextRequest, NextResponse } from 'next/server';

const protectedRoutes = ['/dashboard'];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Treat the user as authenticated if they hold either an access token
  // (15 min TTL) OR a refresh token (7 day TTL). Mirrors buyer-web
  // middleware (PR #83). Gating on the access token alone bounced
  // logged-in sellers to /login mid-session every 15 min — the refresh
  // token is the real session signal; if it's present, apiFetch will
  // mint a new access token on the next API call.
  const hasSession =
    request.cookies.has('teka_access_token') ||
    request.cookies.has('teka_refresh_token');

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
    return NextResponse.redirect(loginUrl);
  }

  // NOTE: no authOnly /login → /dashboard redirect on this surface.
  // COOKIE_DOMAIN=.teka.cd makes buyer cookies visible to seller.teka.cd
  // middleware, so cookie-presence alone is not enough to decide a user
  // is a seller. Render the login form unconditionally; the dashboard
  // layout itself does the role gate and bounces wrong-role users.

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
