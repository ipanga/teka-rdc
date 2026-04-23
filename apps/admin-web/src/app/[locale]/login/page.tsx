'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';

const ADMIN_ROLES = ['ADMIN', 'SUPPORT', 'FINANCE'];

type Mode = 'phone' | 'email';

export default function AdminLoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<Mode>('email');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    if (digits.startsWith('0')) return `+243${digits.slice(1)}`;
    if (digits.startsWith('243')) return `+${digits}`;
    return `+243${digits}`;
  }, []);

  const assertAdminAndRoute = async (user: User) => {
    if (!ADMIN_ROLES.includes(user.role)) {
      setRoleError(true);
      try {
        await apiFetch('/v1/auth/logout', { method: 'POST' });
      } catch {
        // ignore
      }
      return false;
    }
    setUser(user);
    router.push('/dashboard');
    return true;
  };

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
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
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
      await assertAdminAndRoute(res.data.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRoleError(false);
    setIsLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/login/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      await assertAdminAndRoute(res.data.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const tabBtn = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError('');
        setRoleError(false);
      }}
      className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
        mode === m
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">{t('loginTitle')}</h1>
            <p className="text-muted-foreground mt-2">{t('adminPortal')}</p>
          </div>

          <div className="flex mb-6 border-b border-border">
            {tabBtn('email', t('loginWithEmail'))}
            {tabBtn('phone', t('loginWithPhone'))}
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

          {mode === 'email' && !roleError && (
            <>
            <div className="mb-4 flex justify-center">
              <GoogleSignInButton
                onError={(msg) => setError(msg)}
                onWrongRole={() => setRoleError(true)}
              />
            </div>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground uppercase">ou</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                  {t('emailLabel')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  autoComplete="email"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                  {t('passwordLabel')}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email || !password}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('login')}
              </button>
              <Link href="/forgot-password" className="block text-center text-sm text-primary hover:underline">
                {t('forgotPassword')}
              </Link>
            </form>
            </>
          )}

          {mode === 'phone' && step === 'phone' && !roleError && (
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
                    className="flex-1 px-3 py-2 border border-input rounded-r-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={isLoading || !phone}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('sendOtp')}
              </button>
            </form>
          )}

          {mode === 'phone' && step === 'otp' && !roleError && (
            <form onSubmit={handlePhoneLogin} className="space-y-4">
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
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || otp.length !== 6}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('login')}
              </button>
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
                setEmail('');
                setPassword('');
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
