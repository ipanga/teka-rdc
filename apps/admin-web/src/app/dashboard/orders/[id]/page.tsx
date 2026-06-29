'use client';

import { formatFC, formatUSD } from '@teka/shared';
import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { OrderStatusBadge } from '@/components/orders/order-status-badge';

interface OrderItem {
  id: string;
  productId: string;
  title: string;
  quantity: number;
  unitPriceCDF: string;
  unitPriceUSD?: string | null;
  totalCDF: string;
  totalUSD?: string | null;
  coverImageUrl?: string | null;
}

interface OrderAddress {
  id: string;
  label?: string | null;
  town: string;
  neighborhood?: string | null;
  avenue?: string | null;
  details?: string | null;
}

interface OrderBuyer {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  phone: string | null;
  email?: string | null;
}

interface OrderSeller {
  id: string;
  businessName: string;
  user?: {
    firstName?: string | null;
    lastName?: string | null;
    phone: string | null;
    email?: string | null;
  };
}

interface OrderStatusLog {
  id: string;
  status: string;
  note?: string | null;
  createdAt: string;
  changedBy?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  totalCDF: string;
  totalUSD?: string | null;
  subtotalCDF: string;
  subtotalUSD?: string | null;
  deliveryFeeCDF: string;
  deliveryFeeUSD?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  deliveredAt?: string | null;
  returnedAt?: string | null;
  createdAt: string;
  items: OrderItem[];
  address?: OrderAddress | null;
  buyer?: OrderBuyer | null;
  seller?: OrderSeller | null;
  statusLogs: OrderStatusLog[];
  // Financial breakdown: seller revenue (subtotal), Teka commission (platform
  // revenue), seller net. `isFinal` once delivered (persisted earning).
  financials?: {
    grossCDF: string;
    commissionCDF: string;
    netCDF: string;
    commissionRate: string;
    isFinal: boolean;
  };
}

const ALL_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'READY_FOR_TEKA_PICKUP',
  'RECEIVED_AT_TEKA',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
];

export default function OrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Force status modal state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

  // Cancel modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);

  // Teka-managed delivery transition state
  const [isSubmittingManaged, setIsSubmittingManaged] = useState(false);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchOrder = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<OrderDetail>(`/v1/admin/orders/${orderId}`);
      setOrder(res.data);
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  const formatCDF = (centimes: string) => formatFC(centimes);


  const handleForceStatus = async () => {
    if (!order || !newStatus) return;

    setIsSubmittingStatus(true);
    try {
      await apiFetch(`/v1/admin/orders/${order.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          note: statusNote.trim() || undefined,
        }),
      });
      showFeedback('success', "Statut mis à jour");
      setShowStatusModal(false);
      setNewStatus('');
      setStatusNote('');
      fetchOrder();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  const handleManagedAction = async (
    action: 'receive' | 'dispatch' | 'deliver',
    successLabel: string,
  ) => {
    if (!order) return;
    setIsSubmittingManaged(true);
    try {
      await apiFetch(`/v1/admin/orders/${order.id}/${action}`, {
        method: 'PATCH',
      });
      showFeedback('success', successLabel);
      fetchOrder();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmittingManaged(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;

    setIsSubmittingCancel(true);
    try {
      await apiFetch(`/v1/admin/orders/${order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({
          reason: cancelReason.trim() || undefined,
        }),
      });
      showFeedback('success', "Commande annulée");
      setShowCancelModal(false);
      setCancelReason('');
      fetchOrder();
    } catch {
      showFeedback('error', 'Erreur');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const getOptimizedUrl = (url: string) => {
    return url.replace('/upload/', '/upload/w_60,h_60,c_fill,f_auto/');
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Aucune commande</p>
        <Link
          href="/dashboard/orders"
          className="text-primary hover:underline text-sm mt-2 inline-block"
        >
          Retour aux commandes
        </Link>
      </div>
    );
  }

  const isTerminal = order.status === 'DELIVERED' || order.status === 'CANCELLED' || order.status === 'RETURNED';

  return (
    <div className="p-8">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Back link */}
      <Link
        href="/dashboard/orders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Retour aux commandes
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Détail de la commande — {order.orderNumber}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(order.createdAt).toLocaleDateString('fr-CD', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Order items + Totals */}
        <div className="lg:col-span-2 space-y-6">
          {/* Order Items */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Articles de la commande
            </h2>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 py-2 border-b border-border last:border-0"
                >
                  {item.coverImageUrl ? (
                    <img
                      src={getOptimizedUrl(item.coverImageUrl)}
                      alt={item.title}
                      className="w-12 h-12 rounded-lg object-cover bg-muted shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Quantité: {item.quantity} &times; {formatCDF(item.unitPriceCDF)}
                    </p>
                  </div>
                  <div className="text-sm font-medium text-foreground whitespace-nowrap">
                    {formatCDF(item.totalCDF)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="mt-4 pt-3 border-t border-border space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sous-total</span>
                <span className="text-foreground">{formatCDF(order.subtotalCDF)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Frais de livraison</span>
                <span className="text-foreground">{formatCDF(order.deliveryFeeCDF)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border">
                <span className="text-foreground">Total</span>
                <span className="text-primary">{formatCDF(order.totalCDF)}</span>
              </div>
              {order.totalUSD && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground"></span>
                  <span className="text-muted-foreground">{formatUSD(order.totalUSD)}</span>
                </div>
              )}
            </div>

            {/* Financial breakdown (commission / payout) */}
            {order.financials && (
              <div className="mt-4 pt-3 border-t border-border space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-foreground">Répartition financière</h3>
                  {!order.financials.isFinal && (
                    <span className="text-xs text-muted-foreground">Estimation</span>
                  )}
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revenu vendeur (produits)</span>
                  <span className="text-foreground">{formatCDF(order.financials.grossCDF)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Commission Teka ({Math.round(Number(order.financials.commissionRate) * 100)}%)
                  </span>
                  <span className="text-success">{formatCDF(order.financials.commissionCDF)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold pt-1 border-t border-border">
                  <span className="text-foreground">Net vendeur (à payer)</span>
                  <span className="text-foreground">{formatCDF(order.financials.netCDF)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Historique
            </h2>
            {order.statusLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun historique</p>
            ) : (
              <div className="space-y-3">
                {order.statusLogs.map((log, index) => (
                  <div key={log.id} className="flex gap-3">
                    {/* Timeline dot and line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full shrink-0 ${
                        index === 0 ? 'bg-primary' : 'bg-border'
                      }`} />
                      {index < order.statusLogs.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="pb-3">
                      <div className="flex items-center gap-2">
                        <OrderStatusBadge status={log.status} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(log.createdAt).toLocaleDateString('fr-CD', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      {log.note && (
                        <p className="text-sm text-foreground mt-1">{log.note}</p>
                      )}
                      {log.changedBy && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.changedBy.firstName} {log.changedBy.lastName}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Info panels */}
        <div className="space-y-6">
          {/* Payment method */}
          {order.paymentMethod && (
            <div className="bg-white rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Mode de paiement
              </h2>
              <p className="text-sm font-medium text-foreground">{order.paymentMethod}</p>
            </div>
          )}

          {/* Buyer Info */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Informations acheteur
            </h2>
            {order.buyer ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">
                  {order.buyer.firstName} {order.buyer.lastName}
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Téléphone</span>
                  <span className="text-foreground">{order.buyer.phone ?? '—'}</span>
                </div>
                {order.buyer.email && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email</span>
                    <span className="text-foreground">{order.buyer.email}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>

          {/* Seller Info */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Informations vendeur
            </h2>
            {order.seller ? (
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">{order.seller.businessName}</p>
                {order.seller.user && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Téléphone</span>
                      <span className="text-foreground">{order.seller.user.phone ?? '—'}</span>
                    </div>
                    {order.seller.user.email && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Email</span>
                        <span className="text-foreground">{order.seller.user.email}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>

          {/* Delivery Address */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Adresse de livraison
            </h2>
            {order.address ? (
              <div className="text-sm text-foreground space-y-0.5">
                {order.address.label && (
                  <p className="font-medium">{order.address.label}</p>
                )}
                <p>{order.address.town}</p>
                {order.address.neighborhood && <p>{order.address.neighborhood}</p>}
                {order.address.avenue && <p>{order.address.avenue}</p>}
                {order.address.details && (
                  <p className="text-muted-foreground">{order.address.details}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">-</p>
            )}
          </div>

          {/* Delivery & cash collection */}
          <div className="bg-white rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Livraison & encaissement
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Encaissement (COD)</span>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    order.paymentStatus === 'COMPLETED'
                      ? 'bg-success/10 text-success'
                      : 'bg-warning/10 text-warning'
                  }`}
                >
                  {order.paymentStatus === 'COMPLETED'
                    ? 'Encaissé'
                    : "En attente d'encaissement"}
                </span>
              </div>
              {order.deliveredAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Livrée le</span>
                  <span className="text-foreground">
                    {new Date(order.deliveredAt).toLocaleDateString('fr-CD', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
              {order.status === 'DELIVERED' && order.deliveredAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retour possible jusqu&apos;au</span>
                  <span className="text-foreground">
                    {new Date(
                      new Date(order.deliveredAt).getTime() + 2 * 86400000,
                    ).toLocaleDateString('fr-CD', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Admin Actions */}
          {!isTerminal && (
            <div className="bg-white rounded-xl border border-border p-4">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Actions
              </h2>
              <div className="space-y-2">
                {/* Teka-managed delivery — primary next step by status. */}
                {order.status === 'READY_FOR_TEKA_PICKUP' && (
                  <button
                    onClick={() => handleManagedAction('receive', 'Reçue par Teka')}
                    disabled={isSubmittingManaged}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingManaged ? '...' : 'Marquer reçue par Teka'}
                  </button>
                )}
                {order.status === 'RECEIVED_AT_TEKA' && (
                  <button
                    onClick={() => handleManagedAction('dispatch', 'En livraison')}
                    disabled={isSubmittingManaged}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingManaged ? '...' : 'Marquer en livraison'}
                  </button>
                )}
                {(order.status === 'OUT_FOR_DELIVERY' ||
                  order.status === 'SHIPPED') && (
                  <button
                    onClick={() =>
                      handleManagedAction(
                        'deliver',
                        'Livrée — encaissement confirmé',
                      )
                    }
                    disabled={isSubmittingManaged}
                    className="w-full px-4 py-2 text-sm font-medium text-white bg-success rounded-lg hover:bg-success/90 disabled:opacity-50 transition-colors"
                  >
                    {isSubmittingManaged
                      ? '...'
                      : "Confirmer la livraison + l'encaissement"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setNewStatus(order.status);
                    setStatusNote('');
                    setShowStatusModal(true);
                  }}
                  className="w-full px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-lg hover:bg-secondary/80 transition-colors"
                >
                  Changer le statut (manuel)
                </button>
                <button
                  onClick={() => {
                    setCancelReason('');
                    setShowCancelModal(true);
                  }}
                  className="w-full px-4 py-2 text-sm font-medium text-destructive bg-destructive/10 rounded-lg hover:bg-destructive/20 transition-colors"
                >
                  Annuler la commande
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Force Status Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowStatusModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Changer le statut</h2>
              <button
                onClick={() => setShowStatusModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Statut <span className="text-destructive">*</span>
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === 'PENDING' ? 'En attente' :
                        s === 'CONFIRMED' ? 'Confirmées' :
                        s === 'PROCESSING' ? 'En préparation' :
                        s === 'SHIPPED' ? 'Expédiées' :
                        s === 'DELIVERED' ? 'Livrées' :
                        s === 'CANCELLED' ? 'Annulées' : 'Retournées'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Note (optionnel)
                </label>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStatusModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleForceStatus}
                  disabled={isSubmittingStatus || !newStatus || newStatus === order.status}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingStatus ? "Chargement..." : "Appliquer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Order Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCancelModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Annuler la commande</h2>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Raison de l&apos;annulation
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCancelOrder}
                  disabled={isSubmittingCancel}
                  className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingCancel ? "Chargement..." : "Annuler la commande"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
