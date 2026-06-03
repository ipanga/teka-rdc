// Microsoft Clarity (session heatmaps + recordings) for buyer-web.
//
// Loaded via next/script (App Router best practice for third-party tags) only
// when BOTH conditions hold:
//   1. NODE_ENV === 'production' — never runs in `next dev` (Requirement 5).
//   2. NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB is set — empty → no-op, the
//      same gate pattern as Sentry/PostHog. NEXT_PUBLIC_* is inlined at build
//      time, so the id is baked from the Docker build-arg (see Dockerfile).
//
// Independent of PostHog (window.posthog) and Sentry — Clarity only touches
// window.clarity, so there is no collision. Privacy note: configure masking
// to "Mask"/"Balanced" in the Clarity dashboard (Rule 10/15 — never expose
// phone numbers); the snippet itself carries no masking config.
import Script from 'next/script';

const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID_BUYER_WEB;

export function Clarity() {
  if (process.env.NODE_ENV !== 'production' || !CLARITY_PROJECT_ID) {
    return null;
  }

  return (
    <Script id="microsoft-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY_PROJECT_ID}");`}
    </Script>
  );
}
