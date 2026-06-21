import { serverFetch } from './server-api';

/** City shape returned by GET /v1/cities (active cities only). */
export interface ServerCity {
  id: string;
  name: string;
  slug: string | null;
  province: string;
  isActive: boolean;
  sortOrder: number;
  // Data-driven town identity (Town Architecture Refactor).
  accentColor?: string | null;
  heroImageUrl?: string | null;
}

/** Active cities, ordered by sortOrder (server-side, ISR-cached). */
export async function getActiveCities(): Promise<ServerCity[]> {
  return (await serverFetch<ServerCity[]>('/v1/cities')) ?? [];
}

/** Resolve a `{ville}` URL segment to an active city, or null. */
export async function findCityBySlug(slug: string): Promise<ServerCity | null> {
  const cities = await getActiveCities();
  return cities.find((c) => c.slug === slug) ?? null;
}

/**
 * Default city for redirects that need a `{ville}` but don't have one
 * (e.g. the legacy global `/categorie/{slug}`). First active city by
 * sortOrder; null only if no cities are configured.
 */
export async function getDefaultCity(): Promise<ServerCity | null> {
  const cities = await getActiveCities();
  return cities[0] ?? null;
}
