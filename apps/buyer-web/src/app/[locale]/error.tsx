'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('Errors');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4">&#9888;&#65039;</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t('somethingWentWrong')}
        </h1>
        <p className="text-muted-foreground mb-6">
          {t('errorMessage')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            {t('tryAgain')}
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 border border-border rounded-lg font-medium text-foreground hover:bg-muted transition-colors"
          >
            {t('backToHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
