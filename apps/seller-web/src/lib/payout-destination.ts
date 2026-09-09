/**
 * S12 — seller payout destination (pure helpers, unit-tested).
 *
 * The API owns the rule: changing the saved destination needs the current
 * password and blocks payout requests for 24 h (`payoutsAvailableAt`); a
 * payout request never carries a destination — the API snapshots the saved
 * one. These helpers only shape what the page shows and what it refuses to
 * send.
 */
import type { SellerPayoutMethod } from './types';

export const PAYOUT_METHODS = ['M_PESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'] as const;

export interface DestinationDraft {
  payoutMethod: string;
  payoutPhone: string;
}

/** True while the API refuses payout requests after a destination change. */
export function isCoolingOff(
  availableAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!availableAt) return false;
  const t = new Date(availableAt).getTime();
  return Number.isFinite(t) && t > now;
}

/** « 10 septembre 2026 à 14:05 » in Lubumbashi time. */
export function formatAvailableAt(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Africa/Lubumbashi',
  }).format(new Date(iso));
}

/** The blocker line shown on the request form, or null when requests are open. */
export function coolingOffNotice(
  availableAt: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!isCoolingOff(availableAt, now)) return null;
  return `Destination modifiée récemment : par sécurité, les retraits sont possibles à partir du ${formatAvailableAt(availableAt as string)}.`;
}

export function hasSavedDestination(saved: SellerPayoutMethod | null): boolean {
  return Boolean(saved?.payoutMethod && saved?.payoutPhone);
}

/** Only a REAL change needs the password and re-arms the cooling-off. */
export function destinationChanged(
  saved: SellerPayoutMethod | null,
  draft: DestinationDraft,
): boolean {
  return (
    saved?.payoutMethod !== draft.payoutMethod ||
    saved?.payoutPhone !== draft.payoutPhone
  );
}

/** French validation of the editor before anything is sent; null = valid. */
export function validateDestinationDraft(
  saved: SellerPayoutMethod | null,
  draft: DestinationDraft,
  password: string,
): string | null {
  if (!PAYOUT_METHODS.includes(draft.payoutMethod as never)) {
    return 'Choisissez un opérateur Mobile Money.';
  }
  if (!/^\+243[0-9]{9}$/.test(draft.payoutPhone)) {
    return 'Le numéro doit être au format +243XXXXXXXXX.';
  }
  if (destinationChanged(saved, draft) && !password) {
    return 'Votre mot de passe est requis pour modifier la destination.';
  }
  return null;
}
