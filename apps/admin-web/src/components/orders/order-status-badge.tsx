'use client';

interface OrderStatusBadgeProps {
  status: string;
}

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-warning/10 text-warning',
  CONFIRMED: 'bg-primary/10 text-primary',
  PROCESSING: 'bg-primary/10 text-primary',
  SHIPPED: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-success/10 text-success',
  CANCELLED: 'bg-destructive/10 text-destructive',
  RETURNED: 'bg-destructive/10 text-destructive',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmées',
  PROCESSING: 'En préparation',
  SHIPPED: 'Expédiées',
  DELIVERED: 'Livrées',
  CANCELLED: 'Annulées',
  RETURNED: 'Retournées',
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
