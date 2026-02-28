'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';

export default function CheckoutSuccessPage() {
  const t = useTranslations('CheckoutSuccess');
  const [orderNumbers, setOrderNumbers] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('teka_checkout_orders');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setOrderNumbers(parsed);
        }
        // Clean up after reading
        sessionStorage.removeItem('teka_checkout_orders');
      }
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="text-center max-w-md w-full">
          {/* Success icon */}
          <div className="mx-auto w-20 h-20 mb-6 rounded-full bg-success/15 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-success"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>

          {/* Heading */}
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mb-6">
            {t('message')}
          </p>

          {/* Order numbers */}
          {orderNumbers.length > 0 && (
            <div className="bg-muted/50 border border-border rounded-lg p-4 mb-8">
              <p className="text-sm font-medium text-muted-foreground mb-2">
                {t('orderNumbers')}
              </p>
              <div className="space-y-1">
                {orderNumbers.map((num) => (
                  <p key={num} className="text-base font-semibold text-foreground">
                    {num}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/orders"
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              {t('viewOrders')}
            </Link>
            <Link
              href="/"
              className="px-6 py-3 border border-border text-foreground rounded-lg text-sm font-medium hover:bg-muted transition-colors"
            >
              {t('continueShopping')}
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
