'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCityStore, type City } from '@/lib/city-store';
import { resolveTownSwitchUrl } from '@/lib/town-switch';

/**
 * The single town-selection action — used by the global CitySelectorModal AND
 * the homepage CityPrompt so there's no duplicated town-switch logic. It:
 *   1. persists the town (cookie + localStorage + profile, via setCity),
 *   2. closes the selector,
 *   3. navigates per the centralized switch rule (resolveTownSwitchUrl).
 *
 * Town-scoped pages (city landing / category / product) keep calling `setCity`
 * directly to adopt their URL town — they must NOT navigate, so they don't use
 * this hook.
 */
export function useSelectTown() {
  const router = useRouter();
  const pathname = usePathname();
  const setCity = useCityStore((s) => s.setCity);
  const closeSelector = useCityStore((s) => s.closeSelector);

  return useCallback(
    (city: City) => {
      setCity(city);
      closeSelector();
      if (city.slug) {
        const target = resolveTownSwitchUrl(pathname, city.slug);
        if (target !== pathname) router.push(target);
      }
    },
    [router, pathname, setCity, closeSelector],
  );
}
