import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

export default function SellerHomePage() {
  const t = useTranslations('HomePage');
  const tc = useTranslations('Common');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
        Espace Vendeur
      </div>
      <h1 className="text-4xl font-bold text-primary">{tc('appName')}</h1>
      <p className="text-lg text-muted-foreground">{t('subtitle')}</p>
      <Link
        href="/login"
        className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
      >
        {tc('login')}
      </Link>
    </main>
  );
}
