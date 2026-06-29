'use client';

type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'READY_FOR_TEKA_PICKUP'
  | 'RECEIVED_AT_TEKA'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

const statusStyles: Record<OrderStatus, string> = {
  PENDING: 'bg-warning/15 text-warning',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  READY_FOR_TEKA_PICKUP: 'bg-indigo-100 text-indigo-700',
  RECEIVED_AT_TEKA: 'bg-indigo-100 text-indigo-700',
  SHIPPED: 'bg-blue-100 text-blue-700',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-success/15 text-success',
  CANCELLED: 'bg-destructive/15 text-destructive',
  RETURNED: 'bg-muted text-muted-foreground',
};

const labelMap: Record<OrderStatus, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmées',
  PROCESSING: 'En préparation',
  READY_FOR_TEKA_PICKUP: 'Prête pour collecte',
  RECEIVED_AT_TEKA: 'Reçue par Teka',
  SHIPPED: 'Expédiées',
  OUT_FOR_DELIVERY: 'En livraison',
  DELIVERED: 'Livrées',
  CANCELLED: 'Annulées',
  RETURNED: 'Retournées',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = status as OrderStatus;
  const style = statusStyles[s] || 'bg-muted text-muted-foreground';
  const label = labelMap[s] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
