/**
 * Public-asset URL under the app's basePath. Plain `<img>` tags do not get
 * Next's basePath automatically, so `/logo.svg` 404s locally where the admin
 * serves under `/admin`. Mirrors next.config.ts: NEXT_PUBLIC_BASE_PATH, '/admin'
 * when unset, '' (root) on admin.teka.cd.
 */
export function assetPath(
  path: string,
  basePath: string | undefined = process.env.NEXT_PUBLIC_BASE_PATH,
): string {
  const base = (basePath ?? '/admin').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
