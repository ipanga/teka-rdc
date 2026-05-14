import { NextRequest, NextResponse } from 'next/server';

const protectedRoutes = ['/dashboard'];
const authOnlyRoutes = ['/login'];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has('teka_access_token');

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthOnly = authOnlyRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !hasToken) {
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

  if (isAuthOnly && hasToken) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
