import { NextRequest, NextResponse } from 'next/server';

// Auth-gated buyer routes. French route names since 2026-06-06 (city-first
// URL refactor): /commandes, /paiement, /favoris (formerly /orders,
// /checkout, /wishlist — old paths 301 to these via next.config). `/favoris`
// stays auth-gated — its API still 401s without a session. `/messages` was
// removed on 2026-05-17 (buyer↔seller messaging retired).
const protectedRoutes = [
  '/profil',
  '/addresses',
  '/commandes',
  '/paiement',
  '/favoris',
];

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
    request.cookies.has('teka_buyer_access_token') ||
    request.cookies.has('teka_buyer_refresh_token');

  const isProtected = protectedRoutes.some(
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

  // NOTE — auth-only routes (/connexion, /reclamer-compte) are intentionally
  // NOT bounced here anymore (2026-06-07). `hasSession` is a *presence* check
  // on the token cookies; it can't tell a live session from a dead one whose
  // cookie merely lingers (expired JWT still within cookie maxAge, or a
  // `teka_session` hint desync that stops api-client from refreshing/clearing
  // the stale cookie). When that happened the middleware bounced /connexion →
  // home while the app store was correctly guest (/me 401) — so a logged-out
  // user could never reach the login form, and the wishlist heart's guest
  // branch (push to /connexion) bounced straight back, looking inert.
  //
  // The "already-logged-in → skip the login page" redirect now lives on the
  // /connexion page itself, which uses the REAL session state (auth store /
  // /me) instead of cookie presence. The protected-route gate above keeps its
  // presence check: letting a stale-cookie user *into* a protected page is
  // benign (its API calls 401 and it can now reach /connexion to recover),
  // whereas locking them *out* of login was the harmful failure mode.

  const response = NextResponse.next();
  if (isProtected) {
    // D4: account pages (profile, orders, checkout, wishlist) are personal —
    // never let a shared cache or the back/forward cache keep them.
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

export const config = {
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
