/**
 * Signed-in buyer « get the app » prompt (M1) — pure decisions, no React.
 *
 * Who sees it: a resolved BUYER session, on a PHONE (iPhone or Android
 * phone, any browser on it), outside flows a prompt must not interrupt.
 * Never guests, sellers/admins, tablets, desktops.
 *
 * Phone detection is a heuristic, so three signals must agree: the UA names
 * an iPhone or an Android phone, the primary pointer is coarse, and the
 * device's SHORT side is phone-sized (< 600 CSS px, landscape included —
 * common tablets are larger). It is NOT proof: spoofed UAs, "desktop site"
 * modes, foldables and unusual screens can still be misclassified; those are
 * accepted limitations, and the API never depends on it.
 *
 * Why not Apple's Smart App Banner: adding the `apple-itunes-app` meta to the
 * existing root metadata would show it unconditionally — to guests, on iPad,
 * on checkout/auth paths — which conflicts with the auth/route rules, and it
 * covers Safari only. We chose one shared custom prompt that applies the same
 * rules to iOS (every browser) and Android. (A session-aware server-rendered
 * meta would be possible, but would duplicate these rules and still miss iOS
 * Chrome and Android.) No custom URL scheme either: the app already claims
 * teka.cd links (universal / app links, `public/.well-known/`), and
 * « installed? » cannot be detected from the web, so the copy never promises
 * to open the app.
 */

/** Store listings verified (HTTP 200, publisher TOOTIYE) on 2026-10-17. */
export const APP_STORE_URL = 'https://apps.apple.com/sa/app/teka/id6787126945';
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.tootiye.teka';

export type PromoPlatform = 'ios' | 'android';

export interface DeviceEnv {
  userAgent: string;
  /** `navigator.maxTouchPoints` — tells iPadOS (desktop UA) from a Mac. */
  maxTouchPoints: number;
  /** `(pointer: coarse)` matches. */
  coarsePointer: boolean;
  /** min(screen.width, screen.height) in CSS px. */
  shortSide: number;
}

const PHONE_MAX_SHORT_SIDE = 600;

export function detectPromoPlatform(env: DeviceEnv): PromoPlatform | null {
  const ua = env.userAgent;
  if (!env.coarsePointer || !(env.shortSide > 0 && env.shortSide < PHONE_MAX_SHORT_SIDE)) {
    return null;
  }
  // iPad (old UA) and iPadOS 13+ (Mac UA + touch) are tablets → no prompt.
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && env.maxTouchPoints > 1)) return null;
  // Phones only: every iPhone browser (Safari, Chrome « CriOS », Firefox
  // « FxiOS », Edge) installs from the same App Store. iPod touch is not a
  // phone and is excluded.
  if (/iPod/.test(ua)) return null;
  if (/iPhone/.test(ua)) return 'ios';
  // Android phones carry « Mobile »; Android tablets do not.
  if (/Android/.test(ua) && /Mobile/.test(ua)) return 'android';
  return null;
}

/**
 * Paths where a prompt would interrupt or confuse: sign-in / account claim,
 * cart, checkout, payment and order confirmation (`/paiement/success`,
 * `/paiement/payment-pending`).
 */
const SUPPRESSED_PREFIXES = ['/connexion', '/reclamer-compte', '/panier', '/paiement'];

export function isPromoSuppressedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return SUPPRESSED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// --- dismissal --------------------------------------------------------------

export const DISMISS_KEY = 'teka_app_promo_dismissed_at';
export const DISMISS_DAYS = 30;
const DAY_MS = 86_400_000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * In-memory fallback: when storage is blocked (Safari private mode, embedded
 * browsers, disabled cookies) a dismissal still holds for the rest of the
 * visit, across client-side navigations.
 */
let dismissedThisVisit = false;

/** Test-only reset of the in-memory state. */
export function resetPromoMemory(): void {
  dismissedThisVisit = false;
}

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // accessing localStorage itself can throw (SecurityError)
  }
}

export function isPromoDismissed(now: number = Date.now(), store: StorageLike | null = storage()): boolean {
  if (dismissedThisVisit) return true;
  try {
    const raw = store?.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return now - at < DISMISS_DAYS * DAY_MS && at <= now + DAY_MS;
  } catch {
    return false;
  }
}

/** Records a dismissal (close or store tap). Never throws. */
export function dismissPromo(now: number = Date.now(), store: StorageLike | null = storage()): void {
  dismissedThisVisit = true;
  try {
    store?.setItem(DISMISS_KEY, String(now));
  } catch {
    // Quota / blocked storage: the in-memory flag above covers this visit.
  }
}

/** Reads the live device signals; null outside a browser. */
export function readDeviceEnv(): DeviceEnv | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  let coarsePointer = false;
  try {
    coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  } catch {
    coarsePointer = false;
  }
  const w = window.screen?.width ?? window.innerWidth;
  const h = window.screen?.height ?? window.innerHeight;
  return {
    userAgent: navigator.userAgent ?? '',
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarsePointer,
    shortSide: Math.min(w || 0, h || 0),
  };
}
