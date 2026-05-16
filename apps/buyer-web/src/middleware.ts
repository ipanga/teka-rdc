import { NextRequest, NextResponse } from 'next/server';

// Auth-gated buyer routes. `/wishlist` and `/messages` were missing before
// — the pages hit auth-required APIs (`GET /v1/wishlist`,
// `GET /v1/conversations`) which 401, but the client silently rendered the
// empty state. Users had no signal they needed to log in.
const protectedRoutes = [
  '/profile',
  '/addresses',
  '/orders',
  '/checkout',
  '/wishlist',
  '/messages',
];

// Routes that redirect logged-in users back to home. `/login` and
// `/register` don't exist as routes since the May 2026 monolingual +
// WhatsApp-OTP refactor — the real auth surfaces are `/connexion` and
// `/reclamer-compte`.
const authOnlyRoutes = ['/connexion', '/reclamer-compte'];

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
    // Go straight to /connexion. The previous code redirected to /login,
    // which 301'd to /connexion via next.config redirects — an unnecessary
    // extra hop on every protected-route hit.
    const loginUrl = new URL('/connexion', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthOnly && hasToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
