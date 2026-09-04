/**
 * Admin "À traiter" — pure mapping from `/v1/admin/stats.actionCenter` to the
 * dashboard tiles. Mirrors the API's ADMIN_QUEUES definitions: every tile links
 * to the exact filtered queue its count was computed from (same `where`).
 */
export interface ActionCenterStats {
  sellerApplicationsPending: number;
  productsPendingReview: number;
  returnsPending: number;
  ordersReadyForPickup: number;
  ordersReceivedAtTeka: number;
  payoutsAwaitingReview: { count: number; amountCDF: string };
  payoutsAwaitingPayment: { count: number; processingCount: number; amountCDF: string };
}

export type QueueTone = 'finance' | 'moderation' | 'logistics' | 'returns';

export interface ActionQueue {
  key: keyof ActionCenterStats;
  label: string;
  /** Short qualifier under the label (French). */
  detail: string;
  count: number;
  /** Money attached to the queue, centimes as string, when meaningful. */
  amountCDF?: string;
  href: string;
  tone: QueueTone;
}

export const QUEUE_HREFS: Record<keyof ActionCenterStats, string> = {
  sellerApplicationsPending: '/dashboard/sellers?status=PENDING',
  productsPendingReview: '/dashboard/products?status=PENDING_REVIEW',
  returnsPending: '/dashboard/returns?status=REQUESTED',
  ordersReadyForPickup: '/dashboard/orders?status=READY_FOR_TEKA_PICKUP',
  ordersReceivedAtTeka: '/dashboard/orders?status=RECEIVED_AT_TEKA',
  payoutsAwaitingReview: '/dashboard/payouts?status=REQUESTED',
  payoutsAwaitingPayment: '/dashboard/payouts?status=APPROVED',
};

/** Ordered by operator priority: money and moderation first, logistics next. */
export function buildActionQueues(stats: ActionCenterStats): ActionQueue[] {
  const processing = stats.payoutsAwaitingPayment.processingCount;
  return [
    {
      key: 'payoutsAwaitingReview',
      label: 'Virements à approuver',
      detail: 'demandes vendeurs à examiner',
      count: stats.payoutsAwaitingReview.count,
      amountCDF: stats.payoutsAwaitingReview.amountCDF,
      href: QUEUE_HREFS.payoutsAwaitingReview,
      tone: 'finance',
    },
    {
      key: 'payoutsAwaitingPayment',
      label: 'Virements à payer',
      detail:
        processing > 0
          ? `approuvés, dont ${processing} en traitement`
          : 'approuvés, argent à envoyer',
      count: stats.payoutsAwaitingPayment.count,
      amountCDF: stats.payoutsAwaitingPayment.amountCDF,
      href: QUEUE_HREFS.payoutsAwaitingPayment,
      tone: 'finance',
    },
    {
      key: 'sellerApplicationsPending',
      label: 'Vendeurs à approuver',
      detail: 'dossiers KYC en attente',
      count: stats.sellerApplicationsPending,
      href: QUEUE_HREFS.sellerApplicationsPending,
      tone: 'moderation',
    },
    {
      key: 'productsPendingReview',
      label: 'Produits à valider',
      detail: 'soumis par les vendeurs',
      count: stats.productsPendingReview,
      href: QUEUE_HREFS.productsPendingReview,
      tone: 'moderation',
    },
    {
      key: 'returnsPending',
      label: 'Retours à traiter',
      detail: 'demandes acheteurs',
      count: stats.returnsPending,
      href: QUEUE_HREFS.returnsPending,
      tone: 'returns',
    },
    {
      key: 'ordersReadyForPickup',
      label: 'Colis à collecter',
      detail: 'prêts chez le vendeur',
      count: stats.ordersReadyForPickup,
      href: QUEUE_HREFS.ordersReadyForPickup,
      tone: 'logistics',
    },
    {
      key: 'ordersReceivedAtTeka',
      label: 'Colis à expédier',
      detail: 'reçus à l’entrepôt Teka',
      count: stats.ordersReceivedAtTeka,
      href: QUEUE_HREFS.ordersReceivedAtTeka,
      tone: 'logistics',
    },
  ];
}

export function totalPendingActions(queues: ActionQueue[]): number {
  return queues.reduce((sum, q) => sum + q.count, 0);
}

/**
 * Read an allow-listed `?status=` from a search string. Anything not in the
 * allow-list (including an empty value) yields `''` = "all".
 */
export function readStatusParam<T extends string>(
  search: string,
  allowed: readonly T[],
): T | '' {
  const value = new URLSearchParams(search).get('status');
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/** New `pathname?search` with `status` set or removed; other params untouched. */
export function withStatusParam(href: string, status: string): string {
  const url = new URL(href, 'http://local');
  if (status) url.searchParams.set('status', status);
  else url.searchParams.delete('status');
  return `${url.pathname}${url.search}`;
}
