'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';
import { GoogleSignInButton } from '@/components/auth/google-sign-in-button';

export default function SellerLoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [roleError, setRoleError] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setRoleError(false);
    setIsLoading(true);

    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/login/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const user = res.data.user;
      if (user.role !== 'SELLER') {
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
            <p className="text-muted-foreground mt-2">{t('sellerPortal')}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {roleError && (
            <div className="mb-4 p-4 rounded-lg bg-warning/10 border border-warning/20 text-foreground text-sm">
              <p className="font-medium">{t('notSellerAccount')}</p>
              <p className="mt-1 text-muted-foreground text-xs">{t('notSellerHint')}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
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
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? '...' : t('login')}
            </button>

            <div className="flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="text-primary hover:underline">
                {t('forgotPassword')}
              </Link>
              <Link href="/migrate" className="text-muted-foreground hover:underline">
                {t('migrateTitle')}
              </Link>
            </div>
          </form>

          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase">ou</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <div className="mt-4 flex justify-center">
            <GoogleSignInButton
              onError={(msg) => setError(msg)}
              onWrongRole={() => setRoleError(true)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
