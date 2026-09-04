/**
 * Admin payout workflow — pure presentation/validation helpers.
 *
 * Mirrors the API state machine in `apps/api/src/payouts/payouts.service.ts`:
 *   REQUESTED ──approve──▶ APPROVED ──process──▶ PROCESSING ──complete──▶ COMPLETED
 *   REQUESTED | APPROVED | PROCESSING ──reject(reason)──▶ REJECTED
 *   APPROVED ──complete──▶ COMPLETED
 * The backend stays authoritative (conditional updates → 409 on a stale
 * state); this module only decides which controls to SHOW.
 */
export type PayoutStatus = 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';
export type PayoutAction = 'approve' | 'process' | 'complete' | 'reject';

export const PAYOUT_STATUSES: readonly PayoutStatus[] = [
  'REQUESTED',
  'APPROVED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
];

/** Distinct wording per stage — authorization is never called a payment. */
export const STATUS_LABELS: Record<PayoutStatus, string> = {
  REQUESTED: 'Demandé',
  APPROVED: 'Approuvé — à payer',
  PROCESSING: 'Virement en cours',
  COMPLETED: 'Payé',
  REJECTED: 'Rejeté / échec',
};

export const STATUS_TAB_LABELS: Record<PayoutStatus | '', string> = {
  '': 'Tous',
  REQUESTED: 'À approuver',
  APPROVED: 'À payer',
  PROCESSING: 'En cours',
  COMPLETED: 'Payés',
  REJECTED: 'Rejetés',
};

/** One-line meaning shown next to the badge in the detail panel. */
export const STATUS_HINTS: Record<PayoutStatus, string> = {
  REQUESTED: 'Le vendeur a demandé le retrait de son solde disponible. Aucun argent n’a été envoyé.',
  APPROVED: 'Autorisé par un administrateur. L’argent n’a PAS encore été envoyé.',
  PROCESSING: 'Un opérateur a lancé le transfert. Marquez « payé » uniquement une fois l’argent réellement envoyé.',
  COMPLETED: 'L’argent a été envoyé et confirmé avec une référence de paiement. État final.',
  REJECTED: 'Demande refusée ou transfert échoué. Les revenus réservés ont été rendus au solde du vendeur. État final.',
};

export const STATUS_STYLES: Record<PayoutStatus, string> = {
  REQUESTED: 'bg-warning/10 text-warning',
  APPROVED: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-indigo-100 text-indigo-700',
  COMPLETED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
};

export const TERMINAL_STATUSES: readonly PayoutStatus[] = ['COMPLETED', 'REJECTED'];

/** Which transitions the API accepts from a status — the only controls the UI renders. */
export function allowedActions(status: string): PayoutAction[] {
  switch (status as PayoutStatus) {
    case 'REQUESTED':
      return ['approve', 'reject'];
    case 'APPROVED':
      return ['process', 'complete', 'reject'];
    case 'PROCESSING':
      return ['complete', 'reject'];
    default:
      return [];
  }
}

export const ACTION_META: Record<
  PayoutAction,
  { label: string; title: string; confirm: string; endpoint: string; tone: 'success' | 'primary' | 'destructive' }
> = {
  approve: {
    label: 'Approuver',
    title: 'Approuver la demande',
    confirm: 'Vous autorisez ce virement. Aucun argent n’est envoyé à cette étape ; le vendeur sera informé que sa demande est approuvée.',
    endpoint: 'approve',
    tone: 'primary',
  },
  process: {
    label: 'Lancer le virement',
    title: 'Marquer le virement en cours',
    confirm: 'Vous indiquez que le transfert (mobile money / espèces) est lancé. Le vendeur n’est pas notifié à cette étape.',
    endpoint: 'process',
    tone: 'primary',
  },
  complete: {
    label: 'Marquer payé',
    title: 'Confirmer le paiement',
    confirm: 'Confirmez uniquement si l’argent a réellement été envoyé. Le vendeur recevra « Paiement effectué ». Cette action est définitive.',
    endpoint: 'complete',
    tone: 'success',
  },
  reject: {
    label: 'Rejeter',
    title: 'Rejeter la demande / signaler un échec',
    confirm: 'Les revenus réservés seront rendus au solde disponible du vendeur et il recevra la raison indiquée. Cette action est définitive.',
    endpoint: 'reject',
    tone: 'destructive',
  },
};

/** Label for a PROCESSING rejection — it is a failed transfer, not a refusal. */
export function rejectLabel(status: string): string {
  return status === 'PROCESSING' ? 'Transfert échoué' : 'Rejeter';
}

export const METHOD_LABELS: Record<string, string> = {
  M_PESA: 'M-Pesa (Vodacom)',
  AIRTEL_MONEY: 'Airtel Money',
  ORANGE_MONEY: 'Orange Money',
};
export function methodLabel(method: string | null | undefined): string {
  if (!method) return '—';
  return METHOD_LABELS[method] ?? method;
}

export const REASON_MIN = 5;
export const REASON_MAX = 500;
export const REFERENCE_MAX = 200;

/** Mirrors RejectPayoutDto: 5–500 chars after trim. Returns a French error or null. */
export function validateReason(reason: string): string | null {
  const t = reason.trim();
  if (t.length < REASON_MIN) return `Indiquez une raison d’au moins ${REASON_MIN} caractères.`;
  if (t.length > REASON_MAX) return `La raison est trop longue (${REASON_MAX} caractères max).`;
  return null;
}

/** Mirrors CompletePayoutDto: 1–200 chars after trim. */
export function validateReference(reference: string): string | null {
  const t = reference.trim();
  if (t.length === 0) return 'La référence de paiement (ex. identifiant M-Pesa) est requise.';
  if (t.length > REFERENCE_MAX) return `La référence est trop longue (${REFERENCE_MAX} caractères max).`;
  return null;
}

/**
 * Human message for a failed transition. A 409 means the payout is no longer
 * in a state that accepts the action (another admin moved it, or a retry) —
 * the caller must refresh instead of assuming anything.
 */
export function describeActionError(err: { status?: number; message?: string } | unknown): {
  message: string;
  stale: boolean;
} {
  const e = err as { status?: number; message?: string };
  if (e?.status === 409) {
    return {
      stale: true,
      message:
        e.message && e.message !== 'Une erreur est survenue'
          ? `${e.message} L’état affiché a été actualisé.`
          : 'Ce virement a déjà été traité par un autre administrateur. L’état affiché a été actualisé.',
    };
  }
  if (e?.status === 404) {
    return { stale: true, message: 'Ce virement n’existe plus. La liste a été actualisée.' };
  }
  return {
    stale: false,
    message: e?.message || 'L’action n’a pas pu être appliquée. Réessayez.',
  };
}

export type AuditAction =
  | 'PAYOUT_APPROVED'
  | 'PAYOUT_PROCESSING'
  | 'PAYOUT_COMPLETED'
  | 'PAYOUT_REJECTED';

export const AUDIT_LABELS: Record<string, string> = {
  PAYOUT_APPROVED: 'Approuvé',
  PAYOUT_PROCESSING: 'Virement lancé',
  PAYOUT_COMPLETED: 'Marqué payé',
  PAYOUT_REJECTED: 'Rejeté / échec',
};
