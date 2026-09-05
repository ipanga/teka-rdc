/**
 * Seller notifications → where the seller acts on them, and the payout
 * detail vocabulary. Pure helpers, no fetching: the API stays authoritative
 * (a payout id from a notification is never trusted — `/v1/sellers/payouts/:id`
 * answers 404 for anything the seller does not own).
 */

import { VERIFICATION_HREF } from './verification';

export interface SellerNotificationLike {
  type: string;
  entityType: string | null;
  entityId: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a feed item takes the seller. Unknown / malformed → the products list (previous behaviour). */
export function hrefForNotification(n: SellerNotificationLike): string {
  const id = n.entityId && UUID_RE.test(n.entityId) ? n.entityId : null;
  if (n.entityType === 'product' && id) return `/dashboard/products/${id}`;
  if (n.entityType === 'order' && id) return `/dashboard/orders/${id}`;
  if (n.entityType === 'payout' || n.type === 'PAYOUT') {
    return id ? payoutHref(id) : '/dashboard/earnings?tab=payouts';
  }
  if (n.entityType === 'seller_verification' || n.type === 'SELLER_VERIFICATION') {
    return VERIFICATION_HREF;
  }
  return '/dashboard/products';
}

/** The earnings page, payouts tab, with one payout opened. */
export function payoutHref(payoutId: string): string {
  return `/dashboard/earnings?tab=payouts&payout=${encodeURIComponent(payoutId)}`;
}

export type EarningsTab = 'earnings' | 'payouts';

/**
 * `?tab=payouts&payout=<uuid>` → the initial state of the earnings page.
 * Anything malformed degrades to the default tab with no payout selected —
 * a stale or hand-edited link never breaks the page.
 */
export function parseEarningsQuery(search: string): { tab: EarningsTab; payoutId: string | null } {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const rawPayout = params.get('payout');
  const payoutId = rawPayout && UUID_RE.test(rawPayout) ? rawPayout.toLowerCase() : null;
  const tab: EarningsTab = params.get('tab') === 'payouts' || payoutId ? 'payouts' : 'earnings';
  return { tab, payoutId };
}

/** Seller-facing status vocabulary: approval is never worded as payment. */
export const PAYOUT_STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Demande reçue',
  APPROVED: 'Approuvé — virement en préparation',
  PROCESSING: 'Virement en cours',
  COMPLETED: 'Payé',
  REJECTED: 'Refusé / échec',
};

export const PAYOUT_STATUS_HINTS: Record<string, string> = {
  REQUESTED: 'Teka examine votre demande. Le montant est réservé sur votre solde.',
  APPROVED: 'Votre demande est approuvée. L’argent n’a pas encore été envoyé ; vous serez informé dès que le virement sera effectué.',
  PROCESSING: 'Le virement vers votre compte est en cours.',
  COMPLETED: 'L’argent a été envoyé. Conservez la référence de paiement pour toute réclamation.',
  REJECTED: 'La demande a été refusée ou le virement a échoué. Le montant est de nouveau disponible sur votre solde ; vérifiez la raison puis refaites une demande.',
};

export const PAYOUT_STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-warning/10 text-warning',
  APPROVED: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-primary/10 text-primary',
  COMPLETED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
};

/** French message for a failed payout-detail load. 404 = not yours / gone; never leaks existence. */
export function describePayoutLoadError(err: { status?: number; message?: string } | unknown): string {
  const e = err as { status?: number; message?: string };
  if (e?.status === 404) return 'Ce virement est introuvable ou ne vous appartient pas.';
  if (e?.status === 401 || e?.status === 403) return 'Reconnectez-vous pour consulter ce virement.';
  return 'Impossible de charger ce virement pour le moment. Réessayez plus tard.';
}
