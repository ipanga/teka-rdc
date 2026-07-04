'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { productHref } from '@/lib/urls';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';
import { OrderTimeline } from '@/components/orders/order-timeline';
import { apiFetch, ApiError } from '@/lib/api-client';
import { formatCDF } from '@/lib/format';
import { Badge, Button, Card, Container } from '@/components/ui';
import type { Order, PaymentStatus } from '@/lib/types';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('fr-CD', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<Order | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isRequestingReturn, setIsRequestingReturn] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);
  const [returnError, setReturnError] = useState('');

  useEffect(() => {
    setIsLoading(true);
    setError(false);

    apiFetch<Order>(`/v1/orders/${orderId}`)
      .then((res) => setOrder(res.data))
      .catch(() => setError(true))
      .finally(() => setIsLoading(false));
  }, [orderId]);

  async function handleCancel() {
    if (isCancelling) return;
    setIsCancelling(true);

    try {
      await apiFetch(`/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
      });
      setCancelSuccess(true);
      setShowCancelDialog(false);
      const res = await apiFetch<Order>(`/v1/orders/${orderId}`);
      setOrder(res.data);
    } catch {
      // silent
    } finally {
      setIsCancelling(false);
    }
  }

  async function handleRequestReturn() {
    if (isRequestingReturn || !returnReason.trim()) return;
    setIsRequestingReturn(true);
    setReturnError('');

    try {
      await apiFetch(`/v1/orders/${orderId}/return`, {
        method: 'POST',
        body: JSON.stringify({ reason: returnReason.trim() }),
      });
      setReturnSuccess(true);
      setShowReturnDialog(false);
    } catch (err) {
      setReturnError(
        err instanceof ApiError
          ? err.message
          : 'Impossible de demander le retour. Réessayez.',
      );
    } finally {
      setIsRequestingReturn(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1">
          <Container className="py-6 max-w-4xl">
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-muted rounded w-48" />
              <div className="h-32 bg-muted rounded-xl" />
              <div className="h-48 bg-muted rounded-xl" />
              <div className="h-32 bg-muted rounded-xl" />
            </div>
          </Container>
        </main>
        <Footer />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col bg-surface-muted">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <svg
              className="mx-auto w-16 h-16 text-muted-foreground mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-muted-foreground mb-4">{"Commande introuvable"}</p>
            <Link href="/commandes" className="text-primary hover:underline font-medium">
              {"Retour à mes commandes"}
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const sellerName =
    order.seller?.sellerProfile?.businessName ||
    `${order.seller.firstName} ${order.seller.lastName}`;
  const canCancel = order.status === 'PENDING';

  // Buyer may request a return within 2 days of delivery.
  const RETURN_WINDOW_DAYS = 2;
  const returnDeadline = order.deliveredAt
    ? new Date(new Date(order.deliveredAt).getTime() + RETURN_WINDOW_DAYS * 86400000)
    : null;
  const canReturn =
    order.status === 'DELIVERED' &&
    !returnSuccess &&
    !!returnDeadline &&
    new Date() <= returnDeadline;

  return (
    <div className="min-h-screen flex flex-col bg-surface-muted">
      <Header />

      <main className="flex-1">
        <Container className="py-6 md:py-10 max-w-4xl">
          {/* Back link */}
          <Link
            href="/commandes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {"Retour"}
          </Link>

          {/* Order header */}
          <Card padding="md" className="mb-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                  {"Commande"} #{order.orderNumber}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
              <p>
                {"Vendeur"}: <span className="text-foreground font-medium">{sellerName}</span>
              </p>
              <p>
                {"Mode de paiement"}:{' '}
                <span className="text-foreground font-medium">
                  {order.paymentMethod === 'COD' ? "Paiement à la livraison" : "Mobile Money"}
                </span>
              </p>
              {order.paymentStatus && (
                <div className="flex items-center gap-2 sm:col-span-2">
                  <span>{"Statut du paiement"}:</span>
                  <OrderPaymentStatusBadge status={order.paymentStatus} />
                </div>
              )}
            </div>
          </Card>

          {/* Payment warning */}
          {order.paymentMethod === 'MOBILE_MONEY' &&
            (order.paymentStatus === 'PENDING' || order.paymentStatus === 'FAILED') && (
              <div className="mb-4 p-3 bg-warning-subtle border border-warning/30 rounded-lg text-sm text-warning flex items-start gap-2">
                <svg
                  className="w-5 h-5 shrink-0 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
                <span>{"Le paiement Mobile Money n'a pas encore été confirmé. Veuillez compléter le paiement ou contacter le support."}</span>
              </div>
            )}

          {/* Cancel success */}
          {cancelSuccess && (
            <div className="mb-4 p-3 bg-success-subtle border border-success/30 rounded-lg text-sm text-success flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {"Commande annulée avec succès"}
            </div>
          )}

          {/* Order items */}
          <Card padding="md" className="mb-4">
            <h2 className="text-base font-semibold text-foreground mb-4 tracking-tight">
              {"Articles"} ({order.items.length === 0 ? '0 article' : order.items.length === 1 ? '1 article' : `${order.items.length} articles`})
            </h2>

            <div className="divide-y divide-border">
              {order.items.map((item) => {
                const title = item.productTitle ?? '';
                const thumbUrl = item.productImage
                  ? item.productImage.replace('/upload/', '/upload/w_128,h_128,c_fill,f_auto/')
                  : undefined;
                const p = item.product;
                // Link to the live PDP only when the product is still purchasable.
                // Unavailable products keep the line (snapshot) but aren't linked.
                const available = !!p && p.status === 'ACTIVE';
                const href = available
                  ? productHref({
                      id: p!.id,
                      slug: p!.slug,
                      shortCode: p!.shortCode,
                      citySlug: p!.city?.slug,
                    })
                  : null;

                const thumb = (
                  <div className="relative w-14 h-14 md:w-16 md:h-16 bg-surface-muted rounded-lg overflow-hidden shrink-0 border border-border">
                    {thumbUrl ? (
                      <Image src={thumbUrl} alt={title} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                );

                return (
                  <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    {href ? (
                      <Link href={href} aria-label={title}>{thumb}</Link>
                    ) : (
                      thumb
                    )}

                    <div className="flex-1 min-w-0">
                      {href ? (
                        <Link href={href} className="text-sm font-medium text-foreground line-clamp-2 hover:text-primary hover:underline">
                          {title}
                        </Link>
                      ) : (
                        <p className="text-sm font-medium text-foreground line-clamp-2">{title}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatCDF(item.unitPriceCDF)} × {item.quantity}
                        {p && !available && <span className="text-muted-foreground"> · Indisponible</span>}
                      </p>
                      {/* Rate the product once the order is delivered. Eligibility
                          (one-per-product, moderation) is enforced on the PDP + API. */}
                      {order.status === 'DELIVERED' && href && (
                        <Link
                          href={`${href}#avis`}
                          className="inline-flex items-center gap-1 mt-1.5 text-xs font-medium text-primary hover:underline"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          Noter le produit
                        </Link>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-foreground shrink-0">
                      {formatCDF(item.totalCDF)}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Price breakdown */}
          <Card padding="md" className="mb-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{"Sous-total"}</span>
                <span className="text-foreground">{formatCDF(order.subtotalCDF)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{"Frais de livraison"}</span>
                <span className="text-foreground">
                  {BigInt(order.deliveryFeeCDF) > BigInt(0)
                    ? formatCDF(order.deliveryFeeCDF)
                    : "Gratuit"}
                </span>
              </div>
              <div className="flex justify-between items-baseline border-t border-border pt-3 mt-2">
                <span className="text-base font-semibold text-foreground">{"Total"}</span>
                <span className="text-2xl font-bold text-primary tracking-tight">
                  {formatCDF(order.totalCDF)}
                </span>
              </div>
            </div>
          </Card>

          {/* Delivery address */}
          {order.deliveryAddress && (
            <Card padding="md" className="mb-4">
              <h2 className="text-base font-semibold text-foreground mb-3 tracking-tight">
                {"Adresse de livraison"}
              </h2>
              <div className="text-sm text-muted-foreground space-y-0.5">
                <p className="font-medium text-foreground">{order.deliveryAddress.recipientName}</p>
                <p>{order.deliveryAddress.phone}</p>
                <p>
                  {order.deliveryAddress.neighborhood}, {order.deliveryAddress.town}
                  {order.deliveryAddress.avenue ? `, ${order.deliveryAddress.avenue}` : ''}
                </p>
                {order.deliveryAddress.details && (
                  <p className="text-xs">{order.deliveryAddress.details}</p>
                )}
              </div>
            </Card>
          )}

          {/* Status timeline */}
          {order.statusLogs && order.statusLogs.length > 0 && (
            <Card padding="md" className="mb-4">
              <OrderTimeline logs={order.statusLogs} />
            </Card>
          )}

          {/* Buyer note */}
          {order.buyerNote && (
            <Card padding="md" className="mb-4">
              <h2 className="text-base font-semibold text-foreground mb-2 tracking-tight">Note</h2>
              <p className="text-sm text-muted-foreground italic">{order.buyerNote}</p>
            </Card>
          )}

          {/* Cancel button */}
          {canCancel && !cancelSuccess && (
            <div className="mb-4">
              <Button variant="danger" size="md" onClick={() => setShowCancelDialog(true)}>
                {"Annuler la commande"}
              </Button>
            </div>
          )}

          {/* Return success */}
          {returnSuccess && (
            <div className="mb-4 p-3 bg-success-subtle border border-success/30 rounded-lg text-sm text-success flex items-center gap-2">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {"Demande de retour envoyée. Teka RDC va l'examiner."}
            </div>
          )}

          {/* Return request */}
          {canReturn && (
            <div className="mb-4">
              {returnDeadline && (
                <p className="text-xs text-muted-foreground mb-2">
                  {`Retour possible jusqu'au ${new Intl.DateTimeFormat('fr-CD', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }).format(returnDeadline)}.`}
                </p>
              )}
              <Button variant="outline" size="md" onClick={() => setShowReturnDialog(true)}>
                {"Demander un retour"}
              </Button>
            </div>
          )}

          {/* Cancel dialog */}
          {showCancelDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <Card padding="md" variant="elevated" className="w-full max-w-md shadow-xl">
                <h3 className="text-base font-semibold text-foreground mb-2 tracking-tight">
                  {"Annuler la commande"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">{"Êtes-vous sûr de vouloir annuler cette commande ?"}</p>

                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={"Raison de l'annulation (optionnel)"}
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none mb-4"
                />

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      setShowCancelDialog(false);
                      setCancelReason('');
                    }}
                  >
                    {"Retour"}
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    onClick={handleCancel}
                    disabled={isCancelling}
                  >
                    {isCancelling ? (
                      <>
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        {"Annulation..."}
                      </>
                    ) : (
                      "Annuler"
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Return dialog */}
          {showReturnDialog && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
              <Card padding="md" variant="elevated" className="w-full max-w-md shadow-xl">
                <h3 className="text-base font-semibold text-foreground mb-2 tracking-tight">
                  {"Demander un retour"}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {"Expliquez la raison du retour. Teka RDC examinera votre demande."}
                </p>

                {returnError && (
                  <div className="mb-3 p-2.5 rounded-lg bg-destructive/10 text-destructive text-sm">
                    {returnError}
                  </div>
                )}

                <textarea
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  placeholder={"Raison du retour (article endommagé, non conforme…)"}
                  rows={3}
                  maxLength={500}
                  className="w-full px-3 py-2 border border-input rounded-md bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none mb-4"
                />

                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => {
                      setShowReturnDialog(false);
                      setReturnReason('');
                      setReturnError('');
                    }}
                  >
                    {"Retour"}
                  </Button>
                  <Button
                    variant="default"
                    size="md"
                    onClick={handleRequestReturn}
                    disabled={isRequestingReturn || !returnReason.trim()}
                  >
                    {isRequestingReturn ? "Envoi..." : "Envoyer la demande"}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </Container>
      </main>

      <Footer />
    </div>
  );
}

function OrderPaymentStatusBadge({ status }: { status: PaymentStatus }) {

  const variants: Record<PaymentStatus, 'warning' | 'info' | 'success' | 'danger' | 'default'> = {
    PENDING: 'warning',
    PROCESSING: 'info',
    COMPLETED: 'success',
    FAILED: 'danger',
    REFUNDED: 'default',
  };

  const labelKeys: Record<PaymentStatus, string> = {
    PENDING: 'Paiement en attente',
    PROCESSING: 'Paiement en cours',
    COMPLETED: 'Payé',
    FAILED: 'Paiement échoué',
    REFUNDED: 'Remboursé',
  };

  return (
    <Badge variant={variants[status] || 'default'} size="sm">
      {labelKeys[status] || 'Paiement en attente'}
    </Badge>
  );
}
