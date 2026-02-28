'use client';

import { useTranslations } from 'next-intl';

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

const STATUS_KEYS: Record<string, string> = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const t = useTranslations('Orders');

  const style = STATUS_STYLES[status] || 'bg-secondary text-secondary-foreground';
  const key = STATUS_KEYS[status];
  const label = key ? t(key) : status;

  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
