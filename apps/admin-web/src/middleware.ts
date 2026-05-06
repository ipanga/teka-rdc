import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';

const intlMiddleware = createIntlMiddleware(routing);

const protectedRoutes = ['/dashboard'];
const authOnlyRoutes = ['/login'];

function stripLocalePrefix(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
    if (pathname === `/${locale}`) {
      return '/';
    }
  }
  return pathname;
}

export default function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  const pathname = stripLocalePrefix(request.nextUrl.pathname);
  const hasToken = request.cookies.has('teka_access_token');

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthOnly = authOnlyRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !hasToken) {
    // Use nextUrl.clone() so the basePath (if any) is preserved automatically.
    // Hardcoding `/admin/login` only works in dev where basePath='/admin'; in
    // prod the app is served at admin.teka.cd root and the prefix produces a
    // 404 (admin.teka.cd/admin/login).
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthOnly && hasToken) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = '/dashboard';
    dashboardUrl.search = '';
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
