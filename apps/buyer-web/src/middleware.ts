import { NextRequest, NextResponse } from 'next/server';
import { safeRedirect } from '@/lib/safe-redirect';

// Auth-gated buyer routes. `/messages` was removed on 2026-05-17 when
// direct buyer↔seller messaging was retired in favour of "Contacter le
// support Teka RDC". `/wishlist` stays auth-gated — its API still 401s
// without a session.
const protectedRoutes = [
  '/profile',
  '/addresses',
  '/orders',
  '/checkout',
  '/wishlist',
];

// Routes that redirect logged-in users back to home. `/login` and
// `/register` don't exist as routes since the May 2026 monolingual +
// WhatsApp-OTP refactor — the real auth surfaces are `/connexion` and
// `/reclamer-compte`.
const authOnlyRoutes = ['/connexion', '/reclamer-compte'];

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Treat the user as authenticated if they hold either an access token
  // (15 min TTL) OR a refresh token (7 day TTL). The access token expires
  // every 15 minutes, so gating on it alone kicked logged-in users to
  // /connexion mid-session — most visibly when clicking "Passer la commande"
  // 16+ minutes after login. The refresh token is the real session signal;
  // if it's present, apiFetch will silently mint a new access token on the
  // next API call (see api-client.ts auto-refresh).
  const hasSession =
    request.cookies.has('teka_access_token') ||
    request.cookies.has('teka_refresh_token');

  const isProtected = protectedRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const isAuthOnly = authOnlyRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (isProtected && !hasSession) {
    // Go straight to /connexion. The previous code redirected to /login,
    // which 301'd to /connexion via next.config redirects — an unnecessary
    // extra hop on every protected-route hit.
    const loginUrl = new URL('/connexion', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthOnly && hasSession) {
    // A user with a session shouldn't sit on the login page. Honor a safe
    // relative `?redirect=` (e.g. the product page a wishlist heart came from)
    // instead of always dropping to home, so the round-trip returns the user
    // where they were. Open-redirect guarded by safeRedirect().
    const dest = safeRedirect(request.nextUrl.searchParams.get('redirect'));
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
