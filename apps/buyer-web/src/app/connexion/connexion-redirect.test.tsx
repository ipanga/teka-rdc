import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Shared mocks (hoisted — vi.mock factories run before module init).
const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  redirectParam: '/produit-x' as string | null,
  auth: { user: null as null | { role: string }, isLoading: false },
}));

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  useSearchParams: () => ({ get: () => mocks.redirectParam }),
}));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@teka/shared', () => ({ normalizeDrcPhone: (s: string) => s }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {},
}));
vi.mock('@/lib/auth-store', () => ({
  useAuthStore: (sel: (s: typeof mocks.auth) => unknown) => sel(mocks.auth),
}));
// Lightweight UI stand-ins so the form renders without pulling CVA internals.
vi.mock('@/components/ui', () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  return {
    Button: ({ children, ...p }: AnyProps) => <button {...p}>{children}</button>,
    Card: ({ children }: AnyProps) => <div>{children}</div>,
    Input: (p: AnyProps) => <input {...p} />,
    Label: ({ children }: AnyProps) => <label>{children}</label>,
    cn: (...a: Array<string | false | null | undefined>) => a.filter(Boolean).join(' '),
  };
});

import ConnexionPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirectParam = '/produit-x';
  mocks.auth = { user: null, isLoading: false };
});

describe('ConnexionPage — already-logged-in redirect (real session state)', () => {
  it('redirects a genuinely logged-in buyer to the safe ?redirect target', () => {
    mocks.auth = { user: { role: 'BUYER' }, isLoading: false };
    render(<ConnexionPage />);
    expect(mocks.replace).toHaveBeenCalledWith('/produit-x');
  });

  it('does NOT redirect while auth is still resolving', () => {
    mocks.auth = { user: null, isLoading: true };
    render(<ConnexionPage />);
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('does NOT redirect a guest (stale-cookie/dead session) — shows the login form', () => {
    // The crux of the fix: user resolved to null → the page is reachable so the
    // user can actually log in (previously the middleware bounced them away).
    mocks.auth = { user: null, isLoading: false };
    render(<ConnexionPage />);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(screen.getByText('otpPhoneTitle')).toBeInTheDocument();
  });

  it('defaults to "/" when there is no redirect param', () => {
    mocks.redirectParam = null;
    mocks.auth = { user: { role: 'BUYER' }, isLoading: false };
    render(<ConnexionPage />);
    expect(mocks.replace).toHaveBeenCalledWith('/');
  });
});
