import {
  DISMISS_DAYS,
  DISMISS_KEY,
  detectPromoPlatform,
  dismissPromo,
  isPromoDismissed,
  isPromoSuppressedPath,
  resetPromoMemory,
  type DeviceEnv,
} from './app-promo';

// Real-world user agents (heuristic only — the pointer and screen signals
// must agree too).
const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  ipadLegacy:
    'Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  macSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
} as const;

const phone = (userAgent: string, shortSide = 390): DeviceEnv => ({
  userAgent,
  maxTouchPoints: 5,
  coarsePointer: true,
  shortSide,
});

describe('detectPromoPlatform', () => {
  it.each([
    ['iPhone Safari', UA.iphoneSafari, 'ios'],
    ['iPhone Chrome (CriOS) — still the App Store, not « desktop Safari »', UA.iphoneChrome, 'ios'],
    ['Android Chrome phone', UA.androidChrome, 'android'],
  ])('%s → %s', (_l, ua, expected) => {
    expect(detectPromoPlatform(phone(ua))).toBe(expected);
  });

  it.each([320, 360, 390, 430, 599])('phones from 320 px up (short side %i)', (shortSide) => {
    expect(detectPromoPlatform(phone(UA.androidChrome, shortSide))).toBe('android');
    expect(detectPromoPlatform(phone(UA.iphoneSafari, shortSide))).toBe('ios');
  });

  it('iPod touch is not a phone → no prompt, even with a phone-sized touch screen', () => {
    const ipod =
      'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
    expect(detectPromoPlatform(phone(ipod, 320))).toBeNull(); // its UA even says « iPhone OS »
  });

  it('iPad, old UA or iPadOS 13+ desktop-class UA → no prompt', () => {
    expect(detectPromoPlatform(phone(UA.ipadLegacy, 768))).toBeNull();
    expect(detectPromoPlatform(phone(UA.ipadLegacy, 500))).toBeNull(); // UA says iPad
    expect(detectPromoPlatform({ userAgent: UA.macSafari, maxTouchPoints: 5, coarsePointer: true, shortSide: 820 })).toBeNull();
  });

  it('Android tablet (no « Mobile » token) or a tablet-sized screen → no prompt', () => {
    expect(detectPromoPlatform(phone(UA.androidTablet, 800))).toBeNull();
    expect(detectPromoPlatform(phone(UA.androidTablet, 480))).toBeNull();
    expect(detectPromoPlatform(phone(UA.androidChrome, 600))).toBeNull(); // phone UA, tablet screen
  });

  it('desktops, touch laptops and fine pointers → no prompt', () => {
    expect(detectPromoPlatform({ userAgent: UA.macSafari, maxTouchPoints: 0, coarsePointer: false, shortSide: 900 })).toBeNull();
    expect(detectPromoPlatform({ userAgent: UA.windowsChrome, maxTouchPoints: 10, coarsePointer: true, shortSide: 1080 })).toBeNull();
    // A phone UA alone (spoofed / devtools) is not enough without a coarse pointer.
    expect(detectPromoPlatform({ ...phone(UA.iphoneSafari), coarsePointer: false })).toBeNull();
    expect(detectPromoPlatform({ ...phone(UA.iphoneSafari), shortSide: 0 })).toBeNull();
  });
});

describe('isPromoSuppressedPath', () => {
  it.each([
    '/connexion',
    '/reclamer-compte',
    '/reclamer-compte/confirmer',
    '/panier',
    '/paiement',
    '/paiement/success',
    '/paiement/payment-pending',
  ])('never interrupts %s', (path) => {
    expect(isPromoSuppressedPath(path)).toBe(true);
  });

  // Includes a look-alike (« /panierx ») that must not match the « /panier » prefix.
  it.each(['/', '/lubumbashi', '/lubumbashi/pagne-wax-AB12', '/commandes', '/commandes/abc', '/profil', '/recherche', '/panierx'])(
    'may show on %s',
    (path) => {
      expect(isPromoSuppressedPath(path)).toBe(false);
    },
  );

  it('an unknown path (null) is treated as suppressed', () => {
    expect(isPromoSuppressedPath(null)).toBe(true);
  });
});

describe('dismissal (30 days, storage optional)', () => {
  const NOW = Date.UTC(2026, 9, 17);
  const DAY = 86_400_000;
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  beforeEach(() => resetPromoMemory());

  it('a dismissal hides it for 30 days, then it may show again', () => {
    const s = memory();
    expect(isPromoDismissed(NOW, s)).toBe(false);
    dismissPromo(NOW, s);
    expect(s.m.get(DISMISS_KEY)).toBe(String(NOW));
    resetPromoMemory(); // a new visit: only storage remains
    expect(isPromoDismissed(NOW + (DISMISS_DAYS - 1) * DAY, s)).toBe(true);
    expect(isPromoDismissed(NOW + DISMISS_DAYS * DAY, s)).toBe(false);
  });

  it('garbage or far-future stored values do not hide it forever', () => {
    const s = memory();
    s.setItem(DISMISS_KEY, 'not-a-number');
    expect(isPromoDismissed(NOW, s)).toBe(false);
    s.setItem(DISMISS_KEY, String(NOW + 365 * DAY));
    expect(isPromoDismissed(NOW, s)).toBe(false);
  });

  it('blocked storage (throws on read and write) never throws and still holds for this visit', () => {
    const blocked = {
      getItem: () => { throw new DOMException('denied', 'SecurityError'); },
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    };
    expect(isPromoDismissed(NOW, blocked)).toBe(false);
    expect(() => dismissPromo(NOW, blocked)).not.toThrow();
    expect(isPromoDismissed(NOW, blocked)).toBe(true); // in-memory fallback
  });

  it('no storage at all behaves the same', () => {
    expect(isPromoDismissed(NOW, null)).toBe(false);
    dismissPromo(NOW, null);
    expect(isPromoDismissed(NOW, null)).toBe(true);
  });
});
