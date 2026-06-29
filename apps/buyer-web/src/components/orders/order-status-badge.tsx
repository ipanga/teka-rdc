'use client';

import type { OrderStatus } from '@/lib/types';

const statusConfig: Record<OrderStatus, { bgClass: string; textClass: string; label: string }> = {
  PENDING: { bgClass: 'bg-warning/15', textClass: 'text-warning', label: 'Commande reçue' },
  CONFIRMED: { bgClass: 'bg-blue-100', textClass: 'text-blue-700', label: 'Confirmée' },
  PROCESSING: { bgClass: 'bg-indigo-100', textClass: 'text-indigo-700', label: 'En préparation' },
  READY_FOR_TEKA_PICKUP: { bgClass: 'bg-indigo-100', textClass: 'text-indigo-700', label: 'Prête pour collecte' },
  RECEIVED_AT_TEKA: { bgClass: 'bg-purple-100', textClass: 'text-purple-700', label: 'Reçue par Teka' },
  SHIPPED: { bgClass: 'bg-purple-100', textClass: 'text-purple-700', label: 'Expédiée' },
  OUT_FOR_DELIVERY: { bgClass: 'bg-cyan-100', textClass: 'text-cyan-700', label: 'En cours de livraison' },
  DELIVERED: { bgClass: 'bg-success/15', textClass: 'text-success', label: 'Livrée' },
  CANCELLED: { bgClass: 'bg-destructive/15', textClass: 'text-destructive', label: 'Annulée' },
  RETURNED: { bgClass: 'bg-muted', textClass: 'text-muted-foreground', label: 'Retournée' },
};

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

export function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgClass} ${config.textClass}`}
    >
      {config.label}
    </span>
  );
}
