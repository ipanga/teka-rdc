'use client';

import { useTranslations } from 'next-intl';

type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

const statusStyles: Record<OrderStatus, string> = {
  PENDING: 'bg-warning/15 text-warning',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  SHIPPED: 'bg-blue-100 text-blue-700',
  OUT_FOR_DELIVERY: 'bg-blue-100 text-blue-700',
  DELIVERED: 'bg-success/15 text-success',
  CANCELLED: 'bg-destructive/15 text-destructive',
  RETURNED: 'bg-muted text-muted-foreground',
};

export function OrderStatusBadge({ status }: { status: string }) {
  const t = useTranslations('Orders');

  const labelMap: Record<OrderStatus, string> = {
    PENDING: t('pending'),
    CONFIRMED: t('confirmed'),
    PROCESSING: t('processing'),
    SHIPPED: t('shipped'),
    OUT_FOR_DELIVERY: t('outForDeliveryTab'),
    DELIVERED: t('delivered'),
    CANCELLED: t('cancelled'),
    RETURNED: t('returned'),
  };

  const s = status as OrderStatus;
  const style = statusStyles[s] || 'bg-muted text-muted-foreground';
  const label = labelMap[s] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
