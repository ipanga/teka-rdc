'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Container, SectionHeader } from '@/components/ui';
import { ProductGrid } from '@/components/product/product-grid';
import { getRecentlyViewed } from '@/lib/recently-viewed';
import type { BrowseProduct } from '@/lib/types';

/**
 * "Vus récemment" strip (Phase D / D-3). Reads the client-local history on mount
 * (localStorage is unavailable during SSR, so it renders nothing on the server
 * and hydrates on the client). Renders nothing when empty. `excludeId` drops the
 * current product on the PDP so it doesn't list itself. `withContainer` wraps it
 * for the homepage (the PDP already sits inside a container).
 */
export function RecentlyViewed({
  excludeId,
  withContainer = false,
}: {
  excludeId?: string;
  withContainer?: boolean;
}) {
  const t = useTranslations('Products');
  const [items, setItems] = useState<BrowseProduct[]>([]);

  useEffect(() => {
    setItems(getRecentlyViewed().filter((p) => p.id !== excludeId));
  }, [excludeId]);

  if (items.length === 0) return null;

  if (withContainer) {
    return (
      <section className="py-8">
        <Container>
          <SectionHeader title={t('recentlyViewed')} />
          <ProductGrid products={items} />
        </Container>
      </section>
    );
  }

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-foreground mb-4">
        {t('recentlyViewed')}
      </h2>
      <ProductGrid products={items} />
    </section>
  );
}
