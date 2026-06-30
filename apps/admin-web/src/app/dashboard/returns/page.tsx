'use client';

import { formatFC } from '@teka/shared';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { apiFetch, ApiError } from '@/lib/api-client';

interface ReturnOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalCDF: string;
  deliveredAt?: string | null;
  buyer?: { firstName?: string | null; lastName?: string | null; phone?: string | null } | null;
  seller?: {
    firstName?: string | null;
    lastName?: string | null;
    sellerProfile?: { businessName?: string | null } | null;
  } | null;
}

interface ReturnRequest {
  id: string;
  reason: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  reviewNote?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  order: ReturnOrder;
}

interface ReturnsResponse {
  data: ReturnRequest[];
  pagination?: { total: number; page: number; limit: number; totalPages: number };
}

type StatusFilter = '' | 'REQUESTED' | 'APPROVED' | 'REJECTED';

const STATUS_META: Record<string, { label: string; style: string }> = {
  REQUESTED: { label: 'En attente', style: 'bg-warning/10 text-warning' },
  APPROVED: { label: 'Approuvé', style: 'bg-success/10 text-success' },
  REJECTED: { label: 'Rejeté', style: 'bg-destructive/10 text-destructive' },
};

const LIMIT = 20;

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('REQUESTED');
  const [actionId, setActionId] = useState<string | null>(null);
  // Review modal
  const [review, setReview] = useState<{ id: string; mode: 'approve' | 'reject' } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<ReturnsResponse>(`/v1/admin/returns?${params}`);
      setReturns(res.data.data || []);
      setTotalPages(res.data.pagination?.totalPages ?? 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur lors du chargement des retours');
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  // Honor a `?status=` deep-link on mount (dashboard "Retours" ops card).
  useEffect(() => {
    const valid: StatusFilter[] = ['REQUESTED', 'APPROVED', 'REJECTED'];
    const fromUrl = new URLSearchParams(window.location.search).get('status');
    if (fromUrl && (valid as string[]).includes(fromUrl)) {
      setStatusFilter(fromUrl as StatusFilter);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitReview = async () => {
    if (!review) return;
    setActionId(review.id);
    try {
      await apiFetch(`/v1/admin/returns/${review.id}/${review.mode}`, {
        method: 'POST',
        body: JSON.stringify({ note: reviewNote.trim() || undefined }),
      });
      setFeedback(review.mode === 'approve' ? 'Retour approuvé' : 'Retour rejeté');
      setTimeout(() => setFeedback(''), 3000);
      setReview(null);
      setReviewNote('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erreur');
    } finally {
      setActionId(null);
    }
  };

  const formatDate = (s: string) =>
    new Intl.DateTimeFormat('fr-CD', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
      new Date(s),
    );

  const filters: { key: StatusFilter; label: string }[] = [
    { key: 'REQUESTED', label: 'En attente' },
    { key: 'APPROVED', label: 'Approuvés' },
    { key: 'REJECTED', label: 'Rejetés' },
    { key: '', label: 'Tous' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-foreground mb-1">Retours</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Demandes de retour des acheteurs (fenêtre de 2 jours après livraison).
      </p>

      {feedback && (
        <div className="mb-4 px-4 py-3 rounded-lg text-sm font-medium bg-success/10 text-success">
          {feedback}
        </div>
      )}

      <div className="flex flex-wrap gap-1 mb-6 border-b border-border">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setStatusFilter(f.key);
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === f.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : returns.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 text-center">
          <p className="text-muted-foreground">Aucune demande de retour</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Commande</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Acheteur</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Vendeur</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Motif</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r) => {
                  const meta = STATUS_META[r.status];
                  const sellerName =
                    r.order.seller?.sellerProfile?.businessName ||
                    `${r.order.seller?.firstName ?? ''} ${r.order.seller?.lastName ?? ''}`.trim();
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0 align-top">
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/orders/${r.order.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.order.orderNumber}
                        </Link>
                        <p className="text-xs text-muted-foreground">{formatFC(r.order.totalCDF)}</p>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {r.order.buyer?.firstName} {r.order.buyer?.lastName}
                      </td>
                      <td className="px-4 py-3 text-foreground">{sellerName || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs">
                        <span className="line-clamp-2">{r.reason}</span>
                        {r.reviewNote && (
                          <span className="block text-xs italic mt-1">Note: {r.reviewNote}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${meta.style}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {r.status === 'REQUESTED' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setReview({ id: r.id, mode: 'approve' });
                                setReviewNote('');
                              }}
                              disabled={actionId === r.id}
                              className="px-2.5 py-1 text-xs font-medium rounded bg-success/10 text-success hover:bg-success/20 disabled:opacity-50 transition-colors"
                            >
                              Approuver
                            </button>
                            <button
                              onClick={() => {
                                setReview({ id: r.id, mode: 'reject' });
                                setReviewNote('');
                              }}
                              disabled={actionId === r.id}
                              className="px-2.5 py-1 text-xs font-medium rounded border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                            >
                              Rejeter
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground block text-right">
                            {r.reviewedAt ? formatDate(r.reviewedAt) : '—'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Précédent
          </button>
          <span className="text-sm text-muted-foreground">{`Page ${page} sur ${totalPages}`}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm font-medium rounded border border-border text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Review modal */}
      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setReview(null)} />
          <div className="relative bg-white rounded-xl shadow-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-lg font-semibold text-foreground mb-1">
              {review.mode === 'approve' ? 'Approuver le retour' : 'Rejeter le retour'}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {review.mode === 'approve'
                ? 'La commande passera en « Retournée », le stock sera réapprovisionné et la rémunération du vendeur annulée.'
                : 'La demande sera rejetée. La commande reste « Livrée ».'}
            </p>
            <label className="block text-sm font-medium text-foreground mb-1">Note (optionnel)</label>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <div className="flex items-center justify-end gap-3 mt-4">
              <button
                onClick={() => setReview(null)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={submitReview}
                disabled={actionId === review.id}
                className={`px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50 transition-colors ${
                  review.mode === 'approve'
                    ? 'bg-success hover:bg-success/90'
                    : 'bg-destructive hover:bg-destructive/90'
                }`}
              >
                {actionId === review.id ? '...' : review.mode === 'approve' ? 'Approuver' : 'Rejeter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
