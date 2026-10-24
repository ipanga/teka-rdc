import { mergeOrderMutation } from '@teka/shared';
import { apiFetch, ApiError } from './api-client';
import type { Order } from './types';

type Fetcher = typeof apiFetch;

export interface CancelOutcome {
  /** The order to display — the server's view as far as it is known. */
  order: Order;
  cancelled: boolean;
  error: string | null;
}

/**
 * Buyer cancellation: POST, then show the server's answer at once (status,
 * payment, timeline from the mutation response), then try a full re-read.
 * A failed re-read keeps the mutation's result — never a stale « En attente »
 * next to « Commande annulée ». A failed or unknown POST never pretends the
 * order was cancelled; the re-read then shows what really happened.
 */
export async function cancelBuyerOrder(
  orderId: string,
  reason: string | undefined,
  current: Order,
  fetcher: Fetcher = apiFetch,
): Promise<CancelOutcome> {
  let order = current;
  let cancelled = false;
  let error: string | null = null;

  try {
    const res = await fetcher<Partial<Order>>(`/v1/orders/${orderId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason?.trim() || undefined }),
    });
    order = mergeOrderMutation(order, res.data);
    cancelled = true;
  } catch (err) {
    // The API explains a refusal in French (e.g. the seller has just handed
    // the parcel to Teka); a network failure gets a retry hint.
    error =
      err instanceof ApiError
        ? err.message
        : "Impossible d'annuler la commande pour le moment. Vérifiez votre connexion et réessayez.";
  }

  try {
    const res = await fetcher<Order>(`/v1/orders/${orderId}`);
    order = res.data;
  } catch {
    // Keep what we know: the mutation's result, or the previous view.
  }

  return { order, cancelled, error };
}
