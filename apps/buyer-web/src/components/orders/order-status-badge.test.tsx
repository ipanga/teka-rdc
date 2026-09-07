// PR D3 (2026-09-07) — the buyer never sees a raw order enum, and the web
// labels stay the ones buyer-mobile uses.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OrderStatusBadge } from './order-status-badge';
import type { OrderStatus } from '@/lib/types';

const LABELS: Record<OrderStatus, string> = {
  PENDING: 'Commande reçue',
  CONFIRMED: 'Confirmée',
  PROCESSING: 'En préparation',
  READY_FOR_TEKA_PICKUP: 'Prête pour collecte',
  RECEIVED_AT_TEKA: 'Reçue par Teka',
  SHIPPED: 'Expédiée',
  OUT_FOR_DELIVERY: 'En cours de livraison',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
  RETURNED: 'Retournée',
};

describe('OrderStatusBadge', () => {
  it.each(Object.entries(LABELS))('%s renders as %s', (status, label) => {
    render(<OrderStatusBadge status={status as OrderStatus} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });

  it('an unexpected status degrades to a neutral chip, never the raw value', () => {
    render(<OrderStatusBadge status={'SOME_NEW_ENUM' as OrderStatus} />);
    expect(screen.queryByText('SOME_NEW_ENUM')).not.toBeInTheDocument();
  });
});
