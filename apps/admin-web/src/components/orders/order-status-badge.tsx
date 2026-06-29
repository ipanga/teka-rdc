'use client';

interface OrderStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning',
  CONFIRMED: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-primary/10 text-primary',
  READY_FOR_TEKA_PICKUP: 'bg-indigo-100 text-indigo-700',
  RECEIVED_AT_TEKA: 'bg-indigo-100 text-indigo-700',
  SHIPPED: 'bg-primary/10 text-primary',
  OUT_FOR_DELIVERY: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-success/10 text-success',
  CANCELLED: 'bg-destructive/10 text-destructive',
  RETURNED: 'bg-destructive/10 text-destructive',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
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

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const style = STATUS_STYLES[status] || 'bg-secondary text-secondary-foreground';
  const label = STATUS_LABELS[status] || status;

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
