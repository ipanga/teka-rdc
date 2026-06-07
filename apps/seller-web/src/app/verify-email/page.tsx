'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';

export default function SellerVerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <SellerVerifyEmailPageInner />
    </Suspense>
  );
}

type VerifyState = 'verifying' | 'success' | 'error' | 'missing';

function SellerVerifyEmailPageInner() {
  const t = useTranslations('Auth');
  const searchParams = useSearchParams();

  const [state, setState] = useState<VerifyState>('verifying');
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setState('missing');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // GET /v1/auth/email/verify?token=… — @Public, flips emailVerified.
        await apiFetch(
          `/v1/auth/email/verify?token=${encodeURIComponent(token)}`,
        );
        if (!cancelled) setState('success');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : t('verifyEmailError'));
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg border border-border p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              {t('verifyEmailTitle')}
            </h1>
          </div>

          {state === 'verifying' && (
            <p className="text-center text-muted-foreground text-sm">
              {t('verifyEmailLoading')}
            </p>
          )}

          {state === 'success' && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-green-50 text-green-900 text-sm text-center">
                {t('verifyEmailSuccess')}
              </div>
              <Link
                href="/dashboard"
                className="block w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-center hover:bg-primary/90 transition-colors"
              >
                {t('goToDashboard')}
              </Link>
              <Link
                href="/login"
                className="block text-center text-sm text-primary hover:underline"
              >
                &larr; {t('backToLogin')}
              </Link>
            </div>
          )}

          {(state === 'error' || state === 'missing') && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-destructive/10 text-destructive text-sm text-center">
                {state === 'missing'
                  ? t('verifyEmailMissing')
                  : error || t('verifyEmailError')}
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
