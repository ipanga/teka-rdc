import type { BrowseSeller } from '@/lib/types';

/** What « Vérifié » means — and only that. Shown as a native tooltip + accessible name. */
export const VERIFIED_HELP = 'Teka a vérifié les documents justificatifs fournis par ce vendeur.';
export const OFFICIAL_HELP = 'Boutique gérée par Teka RDC.';

export type SellerBadgeKind = 'official' | 'verified' | null;

/** Official wins over verified (one badge, no stacking); nothing for an ordinary seller. */
export function sellerBadgeKind(seller: Pick<BrowseSeller, 'verified' | 'official'> | null | undefined): SellerBadgeKind {
  if (seller?.official) return 'official';
  if (seller?.verified) return 'verified';
  return null;
}

/**
 * Seller trust badge next to the seller identity. Renders nothing unless the
 * API says the seller is verified or official; the unverified state is never
 * labelled publicly. Icon + text, never colour alone.
 */
export function SellerBadge({ seller, size = 'md' }: { seller: Pick<BrowseSeller, 'verified' | 'official'> | null | undefined; size?: 'sm' | 'md' }) {
  const kind = sellerBadgeKind(seller);
  if (!kind) return null;
  const official = kind === 'official';
  const label = official ? 'Officiel' : 'Vérifié';
  const help = official ? OFFICIAL_HELP : VERIFIED_HELP;
  const sizing = size === 'sm' ? 'px-1 py-px text-[9px]' : 'px-1.5 py-0.5 text-[10px]';
  const icon = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3';
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-sm font-bold uppercase tracking-wide shrink-0 ${sizing} ${official ? 'bg-primary-subtle text-primary' : 'bg-success-subtle text-success'}`}
      title={help}
      aria-label={`${official ? 'Vendeur officiel' : 'Vendeur vérifié'} — ${help}`}
      data-testid={`seller-badge-${kind}`}
    >
      <svg className={icon} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
        {official ? (
          <path fillRule="evenodd" d="M10 1l2.39 1.74 2.96.01.91 2.81 2.4 1.75-.92 2.81.92 2.81-2.4 1.75-.91 2.81-2.96.01L10 19l-2.39-1.69-2.96-.01-.91-2.81-2.4-1.75.92-2.81L1.34 7.3l2.4-1.75.91-2.81 2.96-.01L10 1zm3.7 6.3a1 1 0 00-1.4-1.4L9 9.18l-1.3-1.3a1 1 0 10-1.4 1.42l2 2a1 1 0 001.4 0l3.99-4z" clipRule="evenodd" />
        ) : (
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 111.4-1.4L8.5 12l6.8-6.7a1 1 0 011.4 0z" clipRule="evenodd" />
        )}
      </svg>
      {label}
    </span>
  );
}
