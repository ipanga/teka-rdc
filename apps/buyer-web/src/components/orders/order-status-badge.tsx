'use client';

import { useTranslations } from 'next-intl';
import type { OrderStatus } from '@/lib/types';

const statusConfig: Record<OrderStatus, { bgClass: string; textClass: string; labelKey: string }> = {
  PENDING: { bgClass: 'bg-warning/15', textClass: 'text-warning', labelKey: 'pending' },
  CONFIRMED: { bgClass: 'bg-blue-100', textClass: 'text-blue-700', labelKey: 'confirmed' },
  PROCESSING: { bgClass: 'bg-indigo-100', textClass: 'text-indigo-700', labelKey: 'processing' },
  SHIPPED: { bgClass: 'bg-purple-100', textClass: 'text-purple-700', labelKey: 'shipped' },
  OUT_FOR_DELIVERY: { bgClass: 'bg-cyan-100', textClass: 'text-cyan-700', labelKey: 'outForDelivery' },
  DELIVERED: { bgClass: 'bg-success/15', textClass: 'text-success', labelKey: 'delivered' },
  CANCELLED: { bgClass: 'bg-destructive/15', textClass: 'text-destructive', labelKey: 'cancelled' },
  RETURNED: { bgClass: 'bg-muted', textClass: 'text-muted-foreground', labelKey: 'returned' },
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const t = useTranslations('OrderStatus');
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgClass} ${config.textClass}`}
    >
      {t(config.labelKey)}
    </span>
  );
}
