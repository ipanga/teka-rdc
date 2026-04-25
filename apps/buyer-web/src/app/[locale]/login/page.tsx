'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { normalizeDrcPhone } from '@teka/shared';

// Buyers authenticate via phone + SMS OTP only. Phone input rules:
//   - User types 9 digits (or 10 with leading 0); +243 is added automatically.
//   - Anything outside 9–10 digits → null → inline error before any API call.

export default function LoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const phoneIsValid = phone.length >= 9 && phone.length <= 10;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const formattedPhone = normalizeDrcPhone(phone);
    if (!formattedPhone) {
      setError(t('phoneInvalid'));
      return;
    }
    setIsLoading(true);

    try {
      await apiFetch('/v1/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: formattedPhone }),
      });
      setStep('otp');
      setCountdown(60);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Une erreur est survenue');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError('');
    const formattedPhone = normalizeDrcPhone(phone);
    if (!formattedPhone) return;
    setIsLoading(true);

    try {
      await apiFetch('/v1/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: formattedPhone }),
      });
      setCountdown(60);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Une erreur est survenue');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const formattedPhone = normalizeDrcPhone(phone);
    if (!formattedPhone) {
      setError(t('phoneInvalid'));
      return;
    }
    setIsLoading(true);

    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: formattedPhone, code: otp }),
      });
      setUser(res.data.user);
      router.push('/');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError(t('noAccount'));
        } else {
          setError(err.message);
        }
      } else {
        setError('Une erreur est survenue');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">{t('loginTitle')}</h1>
            <p className="text-muted-foreground mt-2">Teka RDC</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">
                  {t('phoneLabel')}
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-input bg-muted text-muted-foreground text-sm">
                    +243
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    maxLength={10}
                    placeholder={t('phonePlaceholder')}
                    className="flex-1 px-3 py-2 border border-input rounded-r-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('phoneHint')}</p>
              </div>
              <button
                type="submit"
                disabled={isLoading || !phoneIsValid}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? '...' : t('sendOtp')}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('otpSent', { phone: normalizeDrcPhone(phone) ?? `+243${phone}` })}
              </p>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-foreground mb-1">
                  {t('otpLabel')}
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground text-center text-lg tracking-widest placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? '...' : t('login')}
              </button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={countdown > 0 || isLoading}
                  className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
                >
                  {countdown > 0 ? t('resendIn', { seconds: countdown }) : t('resendOtp')}
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                  setError('');
                }}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                &larr; {t('phoneLabel')}
              </button>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">{t('noAccount')} </span>
            <Link href="/register" className="text-primary font-medium hover:underline">
              {t('createAccount')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
