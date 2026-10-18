import { formatFC } from '@teka/shared';

/**
 * « Bon de livraison » — the printable, OPERATIONAL delivery document for one
 * order (P1). It is not a tax invoice: no fiscal identifiers, no tax lines,
 * no invoice number — nothing that has not been verified is invented.
 *
 * Everything comes from GET /v1/admin/orders/:id (ADMIN-only, no-store). The
 * ORDER data printed is a SNAPSHOT taken at checkout: item title, charged
 * unit price, list-price snapshot, line totals, delivery fee, totals and the
 * delivery address incl. recipient name/phone (`deliveryAddress`, served from
 * the order's own snapshot by the API) — never a live catalogue price, never
 * the buyer's current address. Identity labels are NOT snapshots: the buyer's
 * account name/phone and the seller's business name come from the live
 * account relations, as the API serves them today (there is no identity
 * snapshot to read; none is invented here).
 * Building it is pure and read-only: no request, no number sequence, no
 * payment change. One order = one seller (a multi-seller cart is several
 * orders, each with its own document).
 */

export interface DocumentOrderItem {
  id: string;
  productTitle: string;
  quantity: number;
  unitPriceCDF: string;
  listUnitPriceCDF?: string | null;
  totalCDF: string;
}

export interface DocumentAddress {
  label?: string | null;
  province?: string | null;
  town?: string | null;
  neighborhood?: string | null;
  avenue?: string | null;
  reference?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
}

export interface DocumentOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  subtotalCDF: string;
  deliveryFeeCDF: string;
  totalCDF: string;
  buyerNote?: string | null;
  createdAt: string;
  deliveredAt?: string | null;
  items: DocumentOrderItem[];
  deliveryAddress?: DocumentAddress | null;
  buyer?: { firstName?: string | null; lastName?: string | null; phone?: string | null } | null;
  seller?: {
    firstName?: string | null;
    lastName?: string | null;
    sellerProfile?: { businessName?: string | null } | null;
  } | null;
}

export type PaymentKind =
  | 'cod_to_collect'
  | 'cod_collected'
  | 'non_cod';

export interface DeliveryDocument {
  orderNumber: string;
  statusLabel: string;
  orderedAt: string;
  generatedAt: string;
  deliveredAt: string | null;
  seller: string;
  buyer: { name: string; phone: string | null };
  recipient: { name: string; phone: string | null };
  /** Address lines, most specific first; empty strings never appear. */
  addressLines: string[];
  instructions: string | null;
  lines: {
    id: string;
    title: string;
    quantity: number;
    unitPrice: string;
    /** Pre-discount snapshot, only when it is higher than the charged price. */
    listUnitPrice: string | null;
    lineTotal: string;
  }[];
  subtotal: string;
  deliveryFee: string;
  total: string;
  payment: {
    kind: PaymentKind;
    methodLabel: string;
    statusLabel: string;
    /** The one amount the courier must act on (or a clear "nothing"). */
    headline: string;
    amount: string;
  };
}

export type DocumentResult =
  | { printable: true; document: DeliveryDocument }
  | { printable: false; orderNumber: string; statusLabel: string; reason: string };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente de confirmation',
  CONFIRMED: 'Confirmée',
  PROCESSING: 'En préparation',
  READY_FOR_TEKA_PICKUP: 'Prête pour collecte',
  RECEIVED_AT_TEKA: 'Reçue par Teka',
  SHIPPED: 'Expédiée',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  RETURNED: 'Retournée',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente d’encaissement',
  PROCESSING: 'En attente d’encaissement',
  COMPLETED: 'Encaissé',
  FAILED: 'Échoué',
  REFUNDED: 'Remboursé',
};

const METHOD_LABELS: Record<string, string> = {
  COD: 'Paiement à la livraison (espèces)',
  MOBILE_MONEY: 'Mobile Money (ancien mode de paiement)',
};

/** Delivery dates read in the launch towns' time zone (Lubumbashi, UTC+2). */
export function formatDocumentDate(iso: string | Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Lubumbashi',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  return t.length ? t : null;
};

const fullName = (p?: { firstName?: string | null; lastName?: string | null } | null) =>
  clean([p?.firstName, p?.lastName].filter(Boolean).join(' '));

const isGreater = (a: string, b: string) => {
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    return false;
  }
};

export function buildDeliveryDocument(order: DocumentOrder, now: Date = new Date()): DocumentResult {
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  // A cancelled or returned order is not on its way to anyone: printing a
  // delivery slip with an amount to collect would be actively misleading.
  if (order.status === 'CANCELLED' || order.status === 'RETURNED') {
    return {
      printable: false,
      orderNumber: order.orderNumber,
      statusLabel,
      reason:
        order.status === 'CANCELLED'
          ? 'Cette commande est annulée : aucun bon de livraison ne peut être émis et aucun montant ne doit être encaissé.'
          : 'Cette commande a été retournée : aucun bon de livraison ne peut être émis et aucun montant ne doit être encaissé.',
    };
  }

  const isCod = order.paymentMethod === 'COD';
  const paymentStatus = order.paymentStatus ?? 'PENDING';
  // A failed or refunded payment on a live order is inconsistent — never
  // print an amount on it; it needs checking first.
  if (isCod && (paymentStatus === 'FAILED' || paymentStatus === 'REFUNDED')) {
    return {
      printable: false,
      orderNumber: order.orderNumber,
      statusLabel,
      reason: `Le paiement de cette commande est « ${PAYMENT_STATUS_LABELS[paymentStatus]} » : vérifiez la commande avant toute livraison. Aucun bon de livraison n’est émis.`,
    };
  }

  const total = formatFC(order.totalCDF);
  let payment: DeliveryDocument['payment'];
  if (!isCod) {
    payment = {
      kind: 'non_cod',
      methodLabel: METHOD_LABELS[order.paymentMethod ?? ''] ?? (order.paymentMethod || 'Non précisé'),
      statusLabel: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
      headline: 'Commande sans paiement à la livraison enregistré : n’encaissez rien sans instruction de Teka.',
      amount: total,
    };
  } else if (paymentStatus === 'COMPLETED') {
    payment = {
      kind: 'cod_collected',
      methodLabel: METHOD_LABELS.COD,
      statusLabel: PAYMENT_STATUS_LABELS.COMPLETED,
      headline: 'Montant déjà encaissé — rien à encaisser',
      amount: total,
    };
  } else {
    payment = {
      kind: 'cod_to_collect',
      methodLabel: METHOD_LABELS.COD,
      statusLabel: PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus,
      headline: 'Montant à encaisser à la livraison',
      amount: total,
    };
  }

  const a = order.deliveryAddress ?? {};
  const addressLines = [
    clean(a.avenue),
    clean([a.neighborhood, a.town].map(clean).filter(Boolean).join(', ')),
    clean(a.province),
    clean(a.reference) ? `Repère : ${clean(a.reference)}` : null,
  ].filter((l): l is string => !!l);

  const buyerName = fullName(order.buyer) ?? 'Client';
  return {
    printable: true,
    document: {
      orderNumber: order.orderNumber,
      statusLabel,
      orderedAt: formatDocumentDate(order.createdAt),
      generatedAt: formatDocumentDate(now),
      deliveredAt: order.status === 'DELIVERED' && order.deliveredAt ? formatDocumentDate(order.deliveredAt) : null,
      seller:
        clean(order.seller?.sellerProfile?.businessName) ?? fullName(order.seller) ?? 'Vendeur',
      buyer: { name: buyerName, phone: clean(order.buyer?.phone) },
      recipient: {
        name: clean(a.recipientName) ?? buyerName,
        phone: clean(a.recipientPhone) ?? clean(order.buyer?.phone),
      },
      addressLines,
      instructions: clean(order.buyerNote),
      lines: order.items.map((it) => ({
        id: it.id,
        title: clean(it.productTitle) ?? 'Article',
        quantity: it.quantity,
        unitPrice: formatFC(it.unitPriceCDF),
        listUnitPrice:
          it.listUnitPriceCDF && isGreater(it.listUnitPriceCDF, it.unitPriceCDF)
            ? formatFC(it.listUnitPriceCDF)
            : null,
        lineTotal: formatFC(it.totalCDF),
      })),
      subtotal: formatFC(order.subtotalCDF),
      deliveryFee: formatFC(order.deliveryFeeCDF),
      total,
      payment,
    },
  };
}
