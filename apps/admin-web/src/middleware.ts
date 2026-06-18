import { NextRequest, NextResponse } from 'next/server';

const protectedRoutes = ['/dashboard'];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Treat the user as authenticated if they hold either an access token
  // (15 min TTL) OR a refresh token (7 day TTL). Mirrors buyer-web
  // middleware (PR #83). Gating on the access token alone bounced
  // logged-in admins to /login mid-session every 15 min — the refresh
  // token is the real session signal; if it's present, apiFetch will
  // mint a new access token on the next API call.
  const hasSession =
    request.cookies.has('teka_admin_access_token') ||
    request.cookies.has('teka_admin_refresh_token');

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !hasSession) {
    // Use nextUrl.clone() so the basePath (if any) is preserved automatically.
    // Hardcoding `/admin/login` only works in dev where basePath='/admin'; in
    // prod the app is served at admin.teka.cd root and the prefix produces a
    // 404 (admin.teka.cd/admin/login).
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // NOTE: no authOnly /login → /dashboard redirect on this surface.
  // Cookies are now per-surface (teka_admin_*), so a logged-in buyer/seller
  // on .teka.cd no longer trips this gate. We still render the login form
  // unconditionally and let the dashboard layout do the ADMIN role check as
  // defense in depth.

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
