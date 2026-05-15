'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { normalizeDrcPhone } from '@teka/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';

type Step = 'phone' | 'code';

function ConfirmerInner() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const setUser = useAuthStore((s) => s.setUser);

  const [step, setStep] = useState<Step>('phone');
  const [rawPhone, setRawPhone] = useState('');
  const [normalizedPhone, setNormalizedPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg border border-border p-8 text-center text-sm text-destructive">
          {t('invalidOrExpiredLink')}
        </div>
      </div>
    );
  }

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const normalized = normalizeDrcPhone(rawPhone);
    if (!normalized) {
      setError(t('otpPhoneInvalid'));
      return;
    }
    setNormalizedPhone(normalized);
    setIsLoading(true);
    try {
      await apiFetch('/v1/auth/buyer/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: normalized }),
      });
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
      const res = await apiFetch<{ user: User }>(
        '/v1/auth/buyer/claim/verify',
        {
          method: 'POST',
          body: JSON.stringify({ token, phone: normalizedPhone, code: digits }),
        },
      );
      setUser(res.data.user);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError(t('claimPhoneAlreadyUsed'));
        else setError(err.message);
      } else setError('Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {t('claimConfirmTitle')}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('claimConfirmIntro')}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {step === 'phone' ? (
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
              <button
                type="submit"
                disabled={isLoading || !rawPhone}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? '...' : t('otpSendCode')}
              </button>
            </form>
          ) : (
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
                    if (v.length === 6) void submitCode(v);
                  }}
                  autoComplete="one-time-code"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="block w-full text-sm text-center text-muted-foreground hover:underline"
              >
                ← {t('otpPhoneLabel')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmerPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmerInner />
    </Suspense>
  );
}
