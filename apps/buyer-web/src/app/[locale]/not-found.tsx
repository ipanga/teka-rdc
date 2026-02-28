import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('Errors');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center max-w-md">
        <div className="text-8xl font-bold text-muted-foreground/30 mb-4">404</div>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {t('pageNotFound')}
        </h1>
        <p className="text-muted-foreground mb-6">
          {t('notFoundMessage')}
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          {t('backToHome')}
        </Link>
      </div>
    </div>
  );
}
