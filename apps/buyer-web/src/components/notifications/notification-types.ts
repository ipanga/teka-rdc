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
// to the canonical /{ville}/{slug}-{shortCode} URL); an order notification
// opens the order detail page; anything else opens the Notification Center.
export function hrefForNotification(n: BuyerNotification): string {
  if (
    (n.type === 'PRODUCT_PROMO' || n.entityType === 'product') &&
    n.entityId
  ) {
    return `/${n.entityId}`;
  }
  if ((n.type === 'ORDER' || n.entityType === 'order') && n.entityId) {
    return `/commandes/${n.entityId}`;
  }
  return '/notifications';
}
