'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { normalizeDrcPhone } from '@teka/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { Button, Card, Label, cn } from '@/components/ui';

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
      <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-5">
            <Link href="/" className="inline-block">
              <span className="text-2xl font-extrabold text-primary tracking-tight">teka</span>
              <span className="text-2xl font-bold text-foreground tracking-tight">.cd</span>
            </Link>
          </div>
          <Card padding="lg" variant="elevated" className="text-center">
            <div className="p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              {t('invalidOrExpiredLink')}
            </div>
          </Card>
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
    <div className="min-h-screen flex items-center justify-center bg-surface-muted px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-5">
          <Link href="/" className="inline-block">
            <span className="text-2xl font-extrabold text-primary tracking-tight">teka</span>
            <span className="text-2xl font-bold text-foreground tracking-tight">.cd</span>
          </Link>
        </div>

        <Card padding="lg" variant="elevated">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {t('claimConfirmTitle')}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t('claimConfirmIntro')}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive-subtle border border-destructive/30 text-destructive text-sm">
              {error}
            </div>
          )}

          {step === 'phone' ? (
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
              <Button
                type="submit"
                disabled={isLoading || !rawPhone}
                size="lg"
                className="w-full"
              >
                {isLoading ? '...' : t('otpSendCode')}
              </Button>
            </form>
          ) : (
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
                    if (v.length === 6) void submitCode(v);
                  }}
                  autoComplete="one-time-code"
                  className={cn(
                    'w-full px-3 py-3 rounded-lg border border-input bg-background text-foreground',
                    'text-center font-mono tracking-[0.5em] text-2xl font-semibold',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent',
                  )}
                />
              </div>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="block w-full text-sm text-center text-muted-foreground hover:text-foreground hover:underline underline-offset-4 transition-colors"
              >
                ← {t('otpPhoneLabel')}
              </button>
            </div>
          )}
        </Card>
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
