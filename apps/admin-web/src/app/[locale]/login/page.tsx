'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';

// Admins authenticate via email + password only. Google is removed (sellers-
// only on the Google path); phone OTP is removed (admins are a distinct role
// boundary from buyers). See docs/architecture.md § Auth for the rationale.
const ADMIN_ROLES = ['ADMIN', 'SUPPORT', 'FINANCE'];

export default function AdminLoginPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [roleError, setRoleError] = useState(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
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

          {!roleError && (
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
          )}

          {roleError && (
            <button
              type="button"
              onClick={() => {
                setRoleError(false);
                setEmail('');
                setPassword('');
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
