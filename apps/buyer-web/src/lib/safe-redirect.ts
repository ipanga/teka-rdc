/**
 * Resolve a post-login / post-bounce redirect target to a SAFE same-origin
 * relative path. Returns `/` for anything that isn't a plain relative path —
 * blocking open-redirects like `//evil.com`, `/\evil.com`, or absolute URLs.
 *
 * Shared by the `/connexion` page (continue-after-login) and the middleware
 * (authOnly-route bounce), so the guard stays consistent + unit-tested.
 */
export function safeRedirect(target: string | null | undefined): string {
  if (!target || !target.startsWith('/')) return '/';
  if (target.startsWith('//') || target.startsWith('/\\')) return '/';
  return target;
}
