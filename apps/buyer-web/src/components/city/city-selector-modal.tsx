'use client';

import { useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useCityStore, type City } from '@/lib/city-store';

export function CitySelectorModal() {
  const t = useTranslations('City');
  const locale = useLocale();
  const { selectedCity, cities, isLoading, showSelector, setCity, fetchCities, closeSelector } = useCityStore();

  useEffect(() => {
    if (cities.length === 0) {
      fetchCities();
    }
  }, [cities.length, fetchCities]);

  // Don't render if city is already selected and selector not explicitly opened
  if (selectedCity && !showSelector) return null;

  // Don't render if no city selected but selector not yet opened (wait for homepage to trigger it)
  if (!showSelector && !selectedCity) return null;

  const getName = (city: City) => city.name;

  // Group cities by province
  const grouped: Record<string, City[]> = {};
  for (const city of cities) {
    if (!grouped[city.province]) grouped[city.province] = [];
    grouped[city.province].push(city);
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-primary text-primary-foreground px-6 py-5 text-center">
          <div className="text-3xl mb-2">{'\uD83C\uDFD9\uFE0F'}</div>
          <h2 className="text-xl font-bold">{t('selectCity')}</h2>
          <p className="text-sm opacity-90 mt-1">{t('selectCityDescription')}</p>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([province, provinceCities]) => (
                <div key={province}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    {province}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {provinceCities.map((city) => (
                      <button
                        key={city.id}
                        onClick={() => setCity(city)}
                        className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          selectedCity?.id === city.id
                            ? 'border-primary bg-primary/5 text-primary font-semibold'
                            : 'border-border hover:border-primary/40 hover:bg-muted/50 text-foreground'
                        }`}
                      >
                        <span className="text-lg">{'\uD83D\uDCCD'}</span>
                        <span className="text-sm font-medium">{getName(city)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Only show close button when explicitly opened (not first-time) */}
        {showSelector && selectedCity && (
          <div className="px-6 pb-6">
            <button
              onClick={closeSelector}
              className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
