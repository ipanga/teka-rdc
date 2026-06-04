'use client';

// Manual $pageview capture for App Router navigations.
//
// posthog-js is initialized with capture_pageview:false (see posthog-provider),
// because client-side route changes in the App Router don't fire a full page
// load. We re-capture on every pathname / query change instead.
//
// Reads useSearchParams() → MUST be rendered inside a <Suspense> boundary at
// the call site, or Next.js 15 fails the prerender.
import { usePathname, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { useEffect } from 'react';

export function PostHogPageview() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!pathname) return;
    let url = window.origin + pathname;
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, posthog]);

  return null;
}
