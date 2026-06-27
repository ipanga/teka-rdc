export interface BuyerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
}

// Deep-link: a product notification opens the PDP (a bare /{id} 308-redirects
// to the canonical /{ville}/{slug}-{shortCode} URL); anything else opens the
// Notification Center.
export function hrefForNotification(n: BuyerNotification): string {
  if (
    (n.type === 'PRODUCT_PROMO' || n.entityType === 'product') &&
    n.entityId
  ) {
    return `/${n.entityId}`;
  }
  return '/notifications';
}
