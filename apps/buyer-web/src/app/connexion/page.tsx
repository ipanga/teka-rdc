'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { normalizeDrcPhone } from '@teka/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { safeRedirect } from '@/lib/safe-redirect';
import { Button, Card, Input, Label, cn } from '@/components/ui';

type Step = 'phone' | 'code';

const SELLER_WEB_URL =
  process.env.NEXT_PUBLIC_SELLER_WEB_URL || 'http://localhost:5100';

function ConnexionInner() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get('redirect'));
  const setUser = useAuthStore((s) => s.setUser);
  const currentUser = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.isLoading);
  const redirectedRef = useRef(false);

  const [step, setStep] = useState<Step>('phone');
  const [rawPhone, setRawPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [expiresLeft, setExpiresLeft] = useState(0);

  const codeRef = useRef<HTMLInputElement | null>(null);

  // Already-logged-in → skip the login page. This used to live in the
  // middleware (bounced on token-cookie *presence*), which stranded users
  // whose cookie lingered after the session died — they couldn't reach login
  // and the wishlist heart's guest redirect bounced back (looked inert). It's
  // now gated on the REAL session state (auth store, resolved via /me), so a
  // stale-cookie/guest user (`currentUser` null once `authLoading` clears)
  // correctly sees the login form and can recover. Sellers go to the seller
  // app; everyone else returns to the safe `?redirect=` target.
  useEffect(() => {
    if (authLoading || !currentUser || redirectedRef.current) return;
    redirectedRef.current = true;
    if (currentUser.role === 'SELLER') {
      window.location.href = SELLER_WEB_URL;
    } else {
      router.replace(redirectTo);
    }
  }, [authLoading, currentUser, redirectTo, router]);

  useEffect(() => {
    if (step !== 'code') return;
    const id = setInterval(() => {
      setCooldownLeft((c) => (c > 0 ? c - 1 : 0));
      setExpiresLeft((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    const normalized = normalizeDrcPhone(rawPhone);
    if (!normalized) {
      setError(t('otpPhoneInvalid'));
      return;
    }
    setNormalizedPhone(normalized);
    setIsLoading(true);
    try {
      const res = await apiFetch<{
        expiresInSeconds: number;
        cooldownSeconds: number;
      }>('/v1/auth/buyer/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: normalized }),
      });
      setExpiresLeft(res.data.expiresInSeconds);
      setCooldownLeft(res.data.cooldownSeconds);
      setStep('code');
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const submitCode = async (digits: string) => {
    if (digits.length !== 6) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/buyer/otp/verify', {
        method: 'POST',
        body: JSON.stringify({
          phone: normalizedPhone,
          code: digits,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        }),
      });

      const user = res.data.user;
      setUser(user);

      if (user.role === 'SELLER') {
        setInfo(t('sellerLoginNotice'));
        window.location.href = SELLER_WEB_URL;
        return;
      }
      // Continue-after-login: return to where the user came from (e.g. the
      // product page they tapped the wishlist heart on). A pending wishlist
      // add stashed in localStorage is completed by WishlistBadge once auth
      // resolves on that page.
      router.push(redirectTo);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldownLeft > 0) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await apiFetch<{
        expiresInSeconds: number;
        cooldownSeconds: number;
      }>('/v1/auth/buyer/otp/resend', {
        method: 'POST',
        body: JSON.stringify({ phone: normalizedPhone }),
      });
      setExpiresLeft(res.data.expiresInSeconds);
      setCooldownLeft(res.data.cooldownSeconds);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand mark above the card — small wordmark */}
        <div className="text-center mb-5">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-extrabold text-primary tracking-tight">teka</span>
            <span className="text-2xl font-bold text-foreground tracking-tight">.cd</span>
          </Link>
        </div>

        <Card padding="lg" variant="elevated">
          {step === 'phone' ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  {t('otpPhoneTitle')}
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  {t('otpPhoneIntro')}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="phone">{t('otpPhoneLabel')}</Label>
                  <div className="flex items-stretch rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:border-transparent">
                    <span className="px-3 flex items-center text-muted-foreground text-sm border-r border-input bg-surface-muted/60 rounded-l-lg font-medium">
                      +243
                    </span>
                    <input
                      id="phone"
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={rawPhone}
                      onChange={(e) =>
                        setRawPhone(e.target.value.replace(/\D/g, ''))
                      }
                      placeholder={t('otpPhonePlaceholder')}
                      autoComplete="tel"
                      className="flex-1 px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none rounded-r-lg text-sm"
                      required
                    />
                  </div>
                </div>

                <details className="text-sm text-muted-foreground group">
                  <summary className="cursor-pointer select-none hover:text-foreground transition-colors">
                    {t('otpFirstTime')}
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('otpFirstName')}
                      autoComplete="given-name"
                    />
                    <Input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t('otpLastName')}
                      autoComplete="family-name"
                    />
                  </div>
                </details>

                <Button
                  type="submit"
                  disabled={isLoading || !rawPhone}
                  size="lg"
                  className="w-full"
                >
                  {isLoading ? '...' : t('otpSendCode')}
                </Button>
              </form>

              <div className="mt-6 text-center text-sm">
                <Link
                  href="/reclamer-compte"
                  className="text-primary hover:text-primary-hover hover:underline underline-offset-4 font-medium"
                >
                  {t('claimTitle')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-foreground tracking-tight">
                  {t('otpCodeTitle')}
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  {t('otpCodeIntro', { phone: normalizedPhone })}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
                  {error}
                </div>
              )}
              {info && (
                <div className="mb-4 p-3 rounded-lg bg-success-subtle border border-success/30 text-success text-sm">
                  {info}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <Label htmlFor="code">{t('otpCodeLabel')}</Label>
                  <input
                    ref={codeRef}
                    id="code"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={code}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                      setCode(v);
                      if (v.length === 6) {
                        void submitCode(v);
                      }
                    }}
                    autoComplete="one-time-code"
                    className={cn(
                      'w-full px-3 py-3 rounded-lg border border-input bg-background text-foreground',
                      'text-center font-mono tracking-[0.5em] text-2xl font-semibold',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent',
                    )}
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors"
                  >
                    ← {t('otpPhoneLabel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldownLeft > 0 || isLoading}
                    className="text-primary hover:text-primary-hover hover:underline underline-offset-4 font-medium disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed transition-colors"
                  >
                    {cooldownLeft > 0
                      ? t('otpResendIn', { seconds: cooldownLeft })
                      : t('otpResend')}
                  </button>
                </div>

                {expiresLeft > 0 && (
                  <p className="text-xs text-muted-foreground text-center">
                    Code valable encore {Math.floor(expiresLeft / 60)}m{' '}
                    {expiresLeft % 60}s
                  </p>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function ConnexionPage() {
  return (
    <Suspense fallback={null}>
      <ConnexionInner />
    </Suspense>
  );
}
