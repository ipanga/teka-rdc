'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { apiFetch, ApiError } from '@/lib/api-client';

type MigrationState =
  | { kind: 'initial' }
  | { kind: 'email_setup_sent' }
  | { kind: 'email_required' }
  | { kind: 'already_migrated' };

const DRC_PHONE_REGEX = /^\+243\d{9}$/;

export default function SellerMigratePage() {
  const t = useTranslations('Auth');

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState<MigrationState>({ kind: 'initial' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const formatPhone = (input: string): string => {
    const digits = input.replace(/\D/g, '');
    if (digits.startsWith('0')) return `+243${digits.slice(1)}`;
    if (digits.startsWith('243')) return `+${digits}`;
    return `+243${digits}`;
  };

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const res = await apiFetch<{
        migration: 'email_setup_sent' | 'email_required' | 'already_migrated';
      }>('/v1/auth/seller/migrate-check', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setState({ kind: res.data.migration } as MigrationState);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Une erreur est survenue');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const formatted = formatPhone(phone);
    if (!DRC_PHONE_REGEX.test(formatted)) {
      setError(t('phoneInvalid'));
      return;
    }
    setIsLoading(true);
    try {
      await apiFetch('/v1/auth/seller/migrate-link-email', {
        method: 'POST',
        body: JSON.stringify({ email, phone: formatted }),
      });
      setState({ kind: 'email_setup_sent' });
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
            <h1 className="text-2xl font-bold text-foreground">{t('migrateTitle')}</h1>
            <p className="text-muted-foreground mt-2 text-sm">{t('migrateIntro')}</p>
          </div>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          {state.kind === 'initial' && (
            <form onSubmit={handleCheck} className="space-y-4">
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
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('sendResetLink')}
              </button>
            </form>
          )}

          {state.kind === 'email_setup_sent' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 text-green-900 text-sm">
                <p className="font-medium">{t('migrateEmailSentTitle')}</p>
                <p className="mt-1">{t('migrateEmailSentBody')}</p>
              </div>
              <Link href="/login" className="block text-center text-sm text-primary hover:underline">
                &larr; {t('backToLogin')}
              </Link>
            </div>
          )}

          {state.kind === 'already_migrated' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-50 text-blue-900 text-sm">
                <p>{t('alreadyMigrated')}</p>
              </div>
              <Link href="/login" className="block text-center text-sm text-primary hover:underline">
                &larr; {t('backToLogin')}
              </Link>
            </div>
          )}

          {state.kind === 'email_required' && (
            <form onSubmit={handleLinkEmail} className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                <p className="font-medium">{t('migrateEmailRequiredTitle')}</p>
                <p className="mt-1">{t('migrateEmailRequiredBody')}</p>
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-foreground mb-1">
                  {t('migrateVerifyPhoneLabel')}
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
                    className="flex-1 px-3 py-2 border border-input rounded-r-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="migrate-email" className="block text-sm font-medium text-foreground mb-1">
                  {t('migrateEmailToAdd')}
                </label>
                <input
                  id="migrate-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !phone || !email}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('migrateVerifyAndContinue')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
