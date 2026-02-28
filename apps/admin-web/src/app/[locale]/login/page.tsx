'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';

const ADMIN_ROLES = ['ADMIN', 'SUPPORT'];

export default function AdminLoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [roleError, setRoleError] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const formatPhone = useCallback((input: string): string => {
    const digits = input.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      return `+243${digits.slice(1)}`;
    }
    if (digits.startsWith('243')) {
      return `+${digits}`;
    }
    return `+243${digits}`;
  }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRoleError(false);
    setIsLoading(true);

    try {
      const formattedPhone = formatPhone(phone);
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
    setIsLoading(true);

    try {
      const formattedPhone = formatPhone(phone);
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
    setRoleError(false);
    setIsLoading(true);

    try {
      const formattedPhone = formatPhone(phone);
      const res = await apiFetch<{ user: User }>('/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone: formattedPhone, code: otp }),
      });

      const user = res.data.user;
      if (!ADMIN_ROLES.includes(user.role)) {
        setRoleError(true);
        try {
          await apiFetch('/v1/auth/logout', { method: 'POST' });
        } catch {
          // ignore
        }
        return;
      }

      setUser(user);
      router.push('/dashboard');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-foreground">{t('loginTitle')}</h1>
            <p className="text-muted-foreground mt-2">{t('adminPortal')}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {roleError && (
            <div className="mb-4 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-foreground text-sm">
              <p className="font-medium">{t('notAdminAccount')}</p>
              <p className="mt-1 text-muted-foreground text-xs">{t('notAdminHint')}</p>
            </div>
          )}

          {step === 'phone' && !roleError && (
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
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t('phonePlaceholder')}
                    className="flex-1 px-3 py-2 border border-input rounded-r-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading || !phone}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? '...' : t('sendOtp')}
              </button>
            </form>
          )}

          {step === 'otp' && !roleError && (
            <form onSubmit={handleLogin} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                {t('otpSent', { phone: formatPhone(phone) })}
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

          {roleError && (
            <button
              type="button"
              onClick={() => {
                setRoleError(false);
                setStep('phone');
                setOtp('');
                setPhone('');
                setError('');
              }}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              {t('tryAgain')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
