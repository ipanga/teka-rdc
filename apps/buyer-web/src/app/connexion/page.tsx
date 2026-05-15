'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { normalizeDrcPhone } from '@teka/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';

type Step = 'phone' | 'code';

const SELLER_WEB_URL =
  process.env.NEXT_PUBLIC_SELLER_WEB_URL || 'http://localhost:5100';

function ConnexionInner() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

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

  // Countdown ticker
  useEffect(() => {
    if (step !== 'code') return;
    const t = setInterval(() => {
      setCooldownLeft((c) => (c > 0 ? c - 1 : 0));
      setExpiresLeft((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  // Auto-focus the code field on step transition
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
      router.push('/');
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
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          {step === 'phone' ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-foreground">
                  {t('otpPhoneTitle')}
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  {t('otpPhoneIntro')}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="phone"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('otpPhoneLabel')}
                  </label>
                  <div className="flex items-stretch rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
                    <span className="px-3 flex items-center text-muted-foreground text-sm border-r border-input">
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
                      className="flex-1 px-3 py-2 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none rounded-r-lg"
                      required
                    />
                  </div>
                </div>

                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer">
                    {t('otpFirstTime')}
                  </summary>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder={t('otpFirstName')}
                      autoComplete="given-name"
                      className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder={t('otpLastName')}
                      autoComplete="family-name"
                      className="px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </details>

                <button
                  type="submit"
                  disabled={isLoading || !rawPhone}
                  className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? '...' : t('otpSendCode')}
                </button>
              </form>

              <div className="mt-6 text-center text-sm">
                <Link
                  href="/reclamer-compte"
                  className="text-primary hover:underline"
                >
                  {t('claimTitle')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-foreground">
                  {t('otpCodeTitle')}
                </h1>
                <p className="text-muted-foreground mt-2 text-sm">
                  {t('otpCodeIntro', { phone: normalizedPhone })}
                </p>
              </div>

              {error && (
                <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}
              {info && (
                <div className="mb-4 p-3 rounded-lg bg-success/10 text-foreground text-sm">
                  {info}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-foreground mb-1"
                  >
                    {t('otpCodeLabel')}
                  </label>
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
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setStep('phone')}
                    className="text-muted-foreground hover:underline"
                  >
                    ← {t('otpPhoneLabel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={cooldownLeft > 0 || isLoading}
                    className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
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
        </div>
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
