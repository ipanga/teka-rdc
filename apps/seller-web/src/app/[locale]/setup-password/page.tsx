'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore, type User } from '@/lib/auth-store';

export default function SellerSetupPasswordPage() {
  const t = useTranslations('Auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUser = useAuthStore((s) => s.setUser);

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [tokenMissing, setTokenMissing] = useState(false);

  useEffect(() => {
    const t = searchParams.get('token');
    if (!t) {
      setTokenMissing(true);
    } else {
      setToken(t);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('passwordHint'));
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ user: User }>('/v1/auth/seller/setup-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setUser(res.data.user);
      router.push('/dashboard');
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
            <h1 className="text-2xl font-bold text-foreground">{t('setupPasswordTitle')}</h1>
            <p className="text-muted-foreground mt-2 text-sm">{t('setupPasswordHint')}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {tokenMissing ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm">
                {t('invalidOrExpiredLink')}
              </div>
              <Link href="/migrate" className="block text-center text-sm text-primary hover:underline">
                {t('migrateTitle')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                  {t('passwordLabel')}
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
                <p className="mt-1 text-xs text-muted-foreground">{t('passwordHint')}</p>
              </div>
              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-foreground mb-1">
                  {t('confirmPasswordLabel')}
                </label>
                <input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !password || !confirm}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('setupPassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
