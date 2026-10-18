import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { useAuthStore, type User } from '@/lib/auth-store';
import { APP_STORE_URL, DISMISS_KEY, PLAY_STORE_URL, resetPromoMemory, type DeviceEnv } from '@/lib/app-promo';
import { AppPromoBanner } from './app-promo-banner';

let pathname = '/';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.69 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; SM-A146P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPADOS =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

const phone = (userAgent: string, shortSide = 390): DeviceEnv => ({ userAgent, maxTouchPoints: 5, coarsePointer: true, shortSide });

const user = (role: string): User =>
  ({ id: 'u1', role, status: 'ACTIVE', phone: '+243999000131', phoneVerified: true, emailVerified: false }) as User;

function signIn(role: string | null, isLoading = false) {
  act(() => useAuthStore.setState({ user: role ? user(role) : null, isLoading }));
}

const banner = () => screen.queryByRole('complementary', { name: 'Application mobile Teka RDC' });

beforeEach(() => {
  pathname = '/';
  resetPromoMemory();
  window.localStorage.clear();
  signIn('BUYER');
});

describe('AppPromoBanner — who sees it', () => {
  it('signed-in buyer on iPhone Safari: App Store link, accessible labels', () => {
    render(<AppPromoBanner deviceEnv={phone(IPHONE_SAFARI)} />);
    expect(banner()).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Télécharger l’application Teka RDC sur l’App Store' });
    expect(link).toHaveAttribute('href', APP_STORE_URL);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('Télécharger l’application');
    expect(screen.getByRole('button', { name: 'Masquer la suggestion d’application (30 jours)' })).toBeInTheDocument();
    // Never promises to open an installed app.
    expect(banner()).not.toHaveTextContent('Ouvrir dans l’application');
  });

  it('iPhone Chrome also gets the App Store (same store for every iOS browser)', () => {
    render(<AppPromoBanner deviceEnv={phone(IPHONE_CHROME)} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', APP_STORE_URL);
  });

  it.each([320, 430])('Android Chrome phone (%i px) gets Google Play', (side) => {
    render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME, side)} />);
    expect(screen.getByRole('link', { name: 'Télécharger l’application Teka RDC sur Google Play' })).toHaveAttribute('href', PLAY_STORE_URL);
  });

  it('iPad (iPadOS desktop-class UA) and desktop: nothing', () => {
    const { rerender } = render(<AppPromoBanner deviceEnv={{ userAgent: IPADOS, maxTouchPoints: 5, coarsePointer: true, shortSide: 820 }} />);
    expect(banner()).toBeNull();
    rerender(<AppPromoBanner deviceEnv={{ userAgent: DESKTOP, maxTouchPoints: 0, coarsePointer: false, shortSide: 1080 }} />);
    expect(banner()).toBeNull();
  });

  it('guest, seller, admin, or session still resolving: nothing', () => {
    for (const [role, loading] of [[null, false], ['SELLER', false], ['ADMIN', false], ['BUYER', true]] as const) {
      signIn(role, loading);
      const { unmount } = render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
      expect(banner()).toBeNull();
      unmount();
    }
  });

  it('appears once the buyer session resolves, disappears on logout', () => {
    signIn(null, true);
    render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
    expect(banner()).toBeNull();
    signIn('BUYER');
    expect(banner()).toBeInTheDocument();
    signIn(null);
    expect(banner()).toBeNull();
  });
});

describe('AppPromoBanner — live signals and SSR', () => {
  it('server render emits nothing (no SEO/SSR footprint, no hydration mismatch)', () => {
    expect(renderToString(<AppPromoBanner deviceEnv={phone(IPHONE_SAFARI)} />)).toBe('');
  });

  it('reads the real device signals when no env is injected', () => {
    const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ANDROID_CHROME);
    const mm = vi.fn().mockReturnValue({ matches: true });
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: mm });
    const sw = vi.spyOn(window.screen, 'width', 'get').mockReturnValue(360);
    const sh = vi.spyOn(window.screen, 'height', 'get').mockReturnValue(780);
    try {
      render(<AppPromoBanner />);
      expect(mm).toHaveBeenCalledWith('(pointer: coarse)');
      expect(screen.getByRole('link')).toHaveAttribute('href', PLAY_STORE_URL);
    } finally {
      ua.mockRestore();
      sw.mockRestore();
      sh.mockRestore();
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
    }
  });

  it('a browser without matchMedia is treated as not-a-phone', () => {
    const ua = vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ANDROID_CHROME);
    const original = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: undefined });
    try {
      render(<AppPromoBanner />);
      expect(banner()).toBeNull();
    } finally {
      ua.mockRestore();
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: original });
    }
  });
});

describe('AppPromoBanner — where', () => {
  it.each(['/connexion', '/reclamer-compte/confirmer', '/panier', '/paiement', '/paiement/success', '/paiement/payment-pending'])(
    'never on %s',
    (path) => {
      pathname = path;
      render(<AppPromoBanner deviceEnv={phone(IPHONE_SAFARI)} />);
      expect(banner()).toBeNull();
    },
  );

  it('shows on browsing and account pages', () => {
    pathname = '/commandes';
    render(<AppPromoBanner deviceEnv={phone(IPHONE_SAFARI)} />);
    expect(banner()).toBeInTheDocument();
  });
});

describe('AppPromoBanner — dismissal', () => {
  it('the close button hides it, persists 30 days and keeps it hidden on the next page', async () => {
    const u = userEvent.setup();
    const { unmount } = render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
    await u.click(screen.getByRole('button', { name: /Masquer la suggestion/ }));
    expect(banner()).toBeNull();
    expect(Number(window.localStorage.getItem(DISMISS_KEY))).toBeGreaterThan(0);
    unmount();

    pathname = '/profil'; // client-side navigation to another page
    render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
    expect(banner()).toBeNull();
  });

  it('tapping the store link also counts as handled (no nagging after)', async () => {
    const u = userEvent.setup();
    render(<AppPromoBanner deviceEnv={phone(IPHONE_SAFARI)} />);
    const link = screen.getByRole('link');
    link.addEventListener('click', (e) => e.preventDefault()); // jsdom: no real navigation
    await u.click(link);
    expect(banner()).toBeNull();
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it('blocked localStorage: still renders, closing works and holds across pages', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    try {
      const u = userEvent.setup();
      const { unmount } = render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
      expect(banner()).toBeInTheDocument();
      await u.click(screen.getByRole('button', { name: /Masquer la suggestion/ }));
      expect(banner()).toBeNull();
      unmount();
      pathname = '/commandes';
      render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
      expect(banner()).toBeNull();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('a dismissal older than 30 days lets it show again', () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * 86_400_000));
    render(<AppPromoBanner deviceEnv={phone(ANDROID_CHROME)} />);
    expect(banner()).toBeInTheDocument();
  });
});
