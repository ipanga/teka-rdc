'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { ProductGrid } from '@/components/product/product-grid';
import type { BrowseProduct } from '@/lib/types';

/**
 * "Produits similaires" on the PDP — fetches the related endpoint (same
 * category + price proximity) and renders them with the standard product grid.
 * Renders nothing while loading or when there are no related products.
 */
export function RelatedProducts({ productId }: { productId: string }) {
  const [items, setItems] = useState<BrowseProduct[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ data: BrowseProduct[] }>(
      `/v1/browse/products/${productId}/related`,
    )
      .then((res) => {
        if (!cancelled) setItems(res.data.data);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (!items || items.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="text-xl font-bold text-foreground mb-4">
        {"Produits similaires"}
      </h2>
      <ProductGrid products={items} />
    </section>
  );
}
