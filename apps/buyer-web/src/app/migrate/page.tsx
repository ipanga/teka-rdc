'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';
import { normalizeDrcPhone } from '@teka/shared';

type MigrationState =
  | { kind: 'initial' }
  | { kind: 'needs_email_setup' }
  | { kind: 'already_migrated' }
  | { kind: 'unknown' }
  | { kind: 'email_setup_sent' };

export default function BuyerMigratePage() {
  const t = useTranslations('Auth');

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<MigrationState>({ kind: 'initial' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const phoneIsValid = phone.length >= 9 && phone.length <= 10;

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const formatted = normalizeDrcPhone(phone);
    if (!formatted) {
      setError(t('phoneInvalid'));
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ migration: MigrationState['kind'] }>(
        '/v1/auth/buyer/migrate-check',
        { method: 'POST', body: JSON.stringify({ phone: formatted }) },
      );
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
    const formatted = normalizeDrcPhone(phone);
    if (!formatted) {
      setError(t('phoneInvalid'));
      return;
    }
    setIsLoading(true);
    try {
      await apiFetch('/v1/auth/buyer/migrate-link-email', {
        method: 'POST',
        body: JSON.stringify({ phone: formatted, email }),
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
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {state.kind === 'initial' && (
            <form onSubmit={handleCheck} className="space-y-4">
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
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    maxLength={10}
                    placeholder={t('phonePlaceholder')}
                    className="flex-1 px-3 py-2 border border-input rounded-r-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('phoneHint')}</p>
              </div>
              <button
                type="submit"
                disabled={isLoading || !phoneIsValid}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('migrateCheckSubmit')}
              </button>
              <Link
                href="/login"
                className="block text-center text-sm text-muted-foreground hover:text-foreground"
              >
                &larr; {t('backToLogin')}
              </Link>
            </form>
          )}

          {state.kind === 'needs_email_setup' && (
            <form onSubmit={handleLinkEmail} className="space-y-4">
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                <p className="font-medium">{t('migrateEmailRequiredTitle')}</p>
                <p className="mt-1">{t('migrateEmailRequiredBody')}</p>
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                  {t('migrateEmailToAdd')}
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
              <button
                type="submit"
                disabled={isLoading || !email}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? '...' : t('migrateVerifyAndContinue')}
              </button>
            </form>
          )}

          {state.kind === 'already_migrated' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-blue-50 text-blue-900 text-sm">
                <p>{t('alreadyMigrated')}</p>
              </div>
              <Link
                href="/login"
                className="block text-center text-sm text-primary hover:underline"
              >
                &larr; {t('backToLogin')}
              </Link>
            </div>
          )}

          {state.kind === 'unknown' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted text-foreground text-sm">
                <p>{t('migrateUnknownPhone')}</p>
              </div>
              <Link
                href="/register"
                className="block text-center text-sm text-primary hover:underline"
              >
                {t('createAccount')}
              </Link>
              <Link
                href="/login"
                className="block text-center text-sm text-muted-foreground hover:text-foreground"
              >
                &larr; {t('backToLogin')}
              </Link>
            </div>
          )}

          {state.kind === 'email_setup_sent' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 text-green-900 text-sm">
                <p className="font-medium">{t('migrateEmailSentTitle')}</p>
                <p className="mt-1">{t('migrateEmailSentBody')}</p>
              </div>
              <Link
                href="/login"
                className="block text-center text-sm text-primary hover:underline"
              >
                &larr; {t('backToLogin')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
