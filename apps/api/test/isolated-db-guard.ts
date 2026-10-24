/**
 * Guard for opt-in real-database suites (`*.pg-spec.ts`): returns a URL only
 * when it is provably a LOCAL, THROWAWAY test database, otherwise throws.
 * Reads nothing but the variable it is given — never `.env*` files — and never
 * echoes the URL (it may carry a password).
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function resolveIsolatedDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.TEKA_INVENTORY_PG_URL;
  if (!raw) {
    throw new Error(
      'TEKA_INVENTORY_PG_URL est requis (base PostgreSQL locale et jetable). Voir test/inventory-concurrency.pg-spec.ts.',
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('TEKA_INVENTORY_PG_URL n’est pas une URL valide.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('TEKA_INVENTORY_PG_URL doit être une URL postgresql://');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // libpq/Prisma let `?host=` override the authority — never allowed here.
  if (url.searchParams.has('host')) {
    throw new Error('Refus : le paramètre host= n’est pas accepté.');
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refus : hôte « ${host || '(vide)'} » non local. Ce test ne touche qu’une base locale.`,
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/test/i.test(database)) {
    throw new Error(
      `Refus : le nom de base « ${database} » doit contenir « test ».`,
    );
  }
  if (env.DATABASE_URL && env.DATABASE_URL.trim() === raw.trim()) {
    throw new Error(
      'Refus : TEKA_INVENTORY_PG_URL est identique à DATABASE_URL.',
    );
  }
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', '20');
  }
  return url.toString();
}
