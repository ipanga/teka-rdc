'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import type { Promotion, PromotionType, SellerProduct } from '@/lib/types';

interface PromotionsResponse {
  promotions: Promotion[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

interface ProductsResponse {
  products: SellerProduct[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

type DiscountMode = 'percent' | 'fixed';

const LIMIT = 20;

export default function PromotionsPage() {
  // Promotions list state
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Cancel state
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  // Create form modal state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);

  // Form fields
  const [formType, setFormType] = useState<PromotionType>('PROMOTION');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formDiscountMode, setFormDiscountMode] = useState<DiscountMode>('percent');
  const [formDiscountValue, setFormDiscountValue] = useState('');
  const [formProductId, setFormProductId] = useState('');
  const [formStartsAt, setFormStartsAt] = useState('');
  const [formEndsAt, setFormEndsAt] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const getTitle = (title: string) => {
    return title || '';
  };

  const formatDate = (dateStr: string) => {
    return new Intl.DateTimeFormat('fr-CD', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  };

  const formatPrice = (centimes: string) => {
    const amount = Number(centimes) / 100;
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
      case 'DRAFT':
        return 'bg-warning/15 text-warning';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700';
      case 'ACTIVE':
        return 'bg-success/15 text-success';
      case 'REJECTED':
        return 'bg-destructive/15 text-destructive';
      case 'EXPIRED':
      case 'CANCELLED':
        return 'bg-muted text-muted-foreground';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return "En attente d'approbation";
      case 'DRAFT':
        return "En attente d'approbation";
      case 'APPROVED':
        return "Approuvée";
      case 'ACTIVE':
        return "Active";
      case 'REJECTED':
        return "Refusée";
      case 'EXPIRED':
        return "Expirée";
      case 'CANCELLED':
        return "Annulée";
      default:
        return status;
    }
  };

  const getTypeLabel = (type: PromotionType) => {
    return type === 'FLASH_DEAL' ? "Vente Flash" : "Promotion";
  };

  const getTypeStyle = (type: PromotionType) => {
    return type === 'FLASH_DEAL'
      ? 'bg-orange-100 text-orange-700'
      : 'bg-purple-100 text-purple-700';
  };

  // Load promotions
  const loadPromotions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      const res = await apiFetch<PromotionsResponse>(`/v1/sellers/promotions?${params}`);
      setPromotions(res.data.promotions || []);
      setTotalPages(res.data.meta?.totalPages ?? 1);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [page]);

  // Load products for the dropdown
  const loadProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const res = await apiFetch<ProductsResponse>('/v1/sellers/products?page=1&limit=100&status=ACTIVE');
      setProducts(res.data.products || []);
    } catch {
      // silently ignore
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  // Cancel promotion
  const handleCancel = async (id: string) => {
    setCancellingId(id);
    setError('');
    try {
      await apiFetch(`/v1/sellers/promotions/${id}`, { method: 'DELETE' });
      setConfirmCancelId(null);
      loadPromotions();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      }
    } finally {
      setCancellingId(null);
    }
  };

  // Open create form
  const openCreateForm = () => {
    setShowCreateForm(true);
    setFormType('PROMOTION');
    setFormTitle('');
    setFormDesc('');
    setFormDiscountMode('percent');
    setFormDiscountValue('');
    setFormProductId('');
    setFormStartsAt('');
    setFormEndsAt('');
    setFormError('');
    loadProducts();
  };

  // Submit create form
  const handleCreateSubmit = async () => {
    if (formSubmitting) return;

    // Validate
    if (!formTitle.trim()) {
      setFormError("Mes promotions" + ' - ' + "Ce champ est requis");
      return;
    }
    if (!formProductId) {
      setFormError("Sélectionner un produit" + ' - ' + "Ce champ est requis");
      return;
    }
    if (!formDiscountValue || Number(formDiscountValue) <= 0) {
      setFormError("Réduction" + ' - ' + "Ce champ est requis");
      return;
    }
    if (!formStartsAt) {
      setFormError("Date de début" + ' - ' + "Ce champ est requis");
      return;
    }
    if (!formEndsAt) {
      setFormError("Date de fin" + ' - ' + "Ce champ est requis");
      return;
    }

    setFormSubmitting(true);
    setFormError('');
    setError('');

    try {
      const body: Record<string, unknown> = {
        type: formType,
        title: formTitle.trim(),
        productId: formProductId,
        startsAt: new Date(formStartsAt).toISOString(),
        endsAt: new Date(formEndsAt).toISOString(),
      };

      if (formDesc.trim()) {
        body.description = formDesc.trim();
      }

      if (formDiscountMode === 'percent') {
        body.discountPercent = Number(formDiscountValue);
      } else {
        // Convert CDF to centimes
        body.discountCDF = String(Math.round(Number(formDiscountValue) * 100));
      }

      await apiFetch('/v1/sellers/promotions', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setSuccessMessage("Promotion créée avec succès");
      setShowCreateForm(false);
      setPage(1);
      loadPromotions();

      // Clear success message after 4 seconds
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const canCancel = (status: string) => {
    return status === 'PENDING_APPROVAL' || status === 'DRAFT';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Mes promotions</h1>
        <button
          onClick={openCreateForm}
          className="inline-flex items-center px-4 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90 transition-colors"
        >
          Créer une promotion
        </button>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 text-success text-sm">
          {successMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Cancel confirmation modal */}
      {confirmCancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-sm mx-4">
            <p className="text-sm text-foreground mb-4">Êtes-vous sûr de vouloir annuler cette promotion ?</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmCancelId(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => handleCancel(confirmCancelId)}
                disabled={cancellingId === confirmCancelId}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              >
                {cancellingId === confirmCancelId ? '...' : 'Annuler'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create promotion modal */}
      {showCreateForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 overflow-y-auto py-8">
          <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-lg mx-4 my-auto">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Créer une promotion
            </h3>

            {formError && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              {/* Product selector */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Sélectionner un produit *
                </label>
                <select
                  value={formProductId}
                  onChange={(e) => setFormProductId(e.target.value)}
                  disabled={productsLoading}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50"
                >
                  <option value="">Sélectionner un produit</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {getTitle(product.title)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Type *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="promoType"
                      value="PROMOTION"
                      checked={formType === 'PROMOTION'}
                      onChange={() => setFormType('PROMOTION')}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">Promotion</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="promoType"
                      value="FLASH_DEAL"
                      checked={formType === 'FLASH_DEAL'}
                      onChange={() => setFormType('FLASH_DEAL')}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">Vente Flash</span>
                  </label>
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Mes promotions *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Description
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              {/* Discount mode */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Réduction *
                </label>
                <div className="flex gap-4 mb-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="discountMode"
                      value="percent"
                      checked={formDiscountMode === 'percent'}
                      onChange={() => {
                        setFormDiscountMode('percent');
                        setFormDiscountValue('');
                      }}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">Pourcentage</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="discountMode"
                      value="fixed"
                      checked={formDiscountMode === 'fixed'}
                      onChange={() => {
                        setFormDiscountMode('fixed');
                        setFormDiscountValue('');
                      }}
                      className="accent-primary"
                    />
                    <span className="text-sm text-foreground">Montant fixe (CDF)</span>
                  </label>
                </div>
                <input
                  type="number"
                  value={formDiscountValue}
                  onChange={(e) => setFormDiscountValue(e.target.value)}
                  placeholder={formDiscountMode === 'percent' ? '10' : '5000'}
                  min="0"
                  step={formDiscountMode === 'percent' ? '1' : '100'}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                {formDiscountMode === 'percent' && (
                  <p className="text-xs text-muted-foreground mt-1">%</p>
                )}
                {formDiscountMode === 'fixed' && (
                  <p className="text-xs text-muted-foreground mt-1">CDF</p>
                )}
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Date de début *
                  </label>
                  <input
                    type="datetime-local"
                    value={formStartsAt}
                    onChange={(e) => setFormStartsAt(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Date de fin *
                  </label>
                  <input
                    type="datetime-local"
                    value={formEndsAt}
                    onChange={(e) => setFormEndsAt(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleCreateSubmit}
                disabled={formSubmitting}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {formSubmitting ? '...' : 'Soumettre pour approbation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promotions list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-border p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : promotions.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <div className="text-4xl text-muted-foreground/40 mb-3">{'\uD83C\uDFF7'}</div>
          <p className="text-muted-foreground font-medium">Aucune promotion</p>
          <p className="text-sm text-muted-foreground mt-1">Créez votre première promotion pour augmenter vos ventes</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Mes promotions
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Réduction
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Sélectionner un produit
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Date de début / Date de fin
                    </th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                      Statut
                    </th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((promo) => (
                    <tr
                      key={promo.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-foreground font-medium">
                        {getTitle(promo.title)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTypeStyle(promo.type)}`}
                        >
                          {getTypeLabel(promo.type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {promo.discountPercent
                          ? `${promo.discountPercent}%`
                          : promo.discountCDF
                            ? formatPrice(promo.discountCDF)
                            : '---'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {promo.product ? getTitle(promo.product.title) : '---'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <div>{formatDate(promo.startsAt)}</div>
                        <div>{formatDate(promo.endsAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusStyle(promo.status)}`}
                        >
                          {getStatusLabel(promo.status)}
                        </span>
                        {promo.status === 'REJECTED' && promo.rejectionReason && (
                          <p className="text-xs text-destructive mt-1">
                            Raison du refus: {promo.rejectionReason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canCancel(promo.status) && (
                          <button
                            onClick={() => setConfirmCancelId(promo.id)}
                            disabled={cancellingId === promo.id}
                            className="text-xs text-destructive hover:underline disabled:opacity-50"
                          >
                            Annuler
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {promotions.map((promo) => (
              <div
                key={promo.id}
                className="bg-white rounded-xl border border-border p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-medium text-foreground text-sm">
                    {getTitle(promo.title)}
                  </h3>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${getStatusStyle(promo.status)}`}
                  >
                    {getStatusLabel(promo.status)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getTypeStyle(promo.type)}`}
                  >
                    {getTypeLabel(promo.type)}
                  </span>
                  <span className="text-xs text-foreground bg-muted px-2 py-0.5 rounded-full">
                    {promo.discountPercent
                      ? `${promo.discountPercent}%`
                      : promo.discountCDF
                        ? formatPrice(promo.discountCDF)
                        : '---'}
                  </span>
                </div>

                {promo.product && (
                  <p className="text-xs text-muted-foreground mb-1">
                    {getTitle(promo.product.title)}
                  </p>
                )}

                <p className="text-xs text-muted-foreground">
                  {formatDate(promo.startsAt)} — {formatDate(promo.endsAt)}
                </p>

                {promo.status === 'REJECTED' && promo.rejectionReason && (
                  <p className="text-xs text-destructive mt-2">
                    Raison du refus: {promo.rejectionReason}
                  </p>
                )}

                {canCancel(promo.status) && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <button
                      onClick={() => setConfirmCancelId(promo.id)}
                      disabled={cancellingId === promo.id}
                      className="text-xs text-destructive hover:underline disabled:opacity-50"
                    >
                      Annuler
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Précédent
              </button>
              <span className="text-sm text-muted-foreground">
                {`Page ${page} sur ${totalPages}`}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
