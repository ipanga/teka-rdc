'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCityStore } from '@/lib/city-store';

/**
 * Non-blocking, inline city chooser shown on the homepage when the visitor
 * has not picked a city yet.
 *
 * Replaces the old forced full-screen modal that auto-opened on first visit —
 * that gate blocked interaction and signalled "content behind interaction" to
 * crawlers. This is plain in-flow content: search engines render the full page
 * with no city required, and users can pick a city (which filters listings) or
 * dismiss the prompt and keep browsing all cities.
 *
 * City buttons set the city client-side for now; Phase 3 turns them into real
 * `/{ville}` links once the city-landing routes exist.
 */
export function CityPrompt() {
  const t = useTranslations('City');
  const { selectedCity, cities, setCity } = useCityStore();
  const [dismissed, setDismissed] = useState(false);

  const activeCities = cities.filter((c) => c.isActive);

  // Nothing to prompt for: a city is already chosen, the user dismissed it,
  // or the city list hasn't loaded yet.
  if (selectedCity || dismissed || activeCities.length === 0) return null;

  return (
    <section className="bg-primary/5 border-b border-primary/10">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              {'📍'}
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {t('selectCity')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('selectCityDescription')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activeCities.map((city) => (
              <button
                key={city.id}
                onClick={() => setCity(city)}
                className="rounded-full border border-primary/30 bg-surface px-4 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {city.name}
              </button>
            ))}
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t('seeAll')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
