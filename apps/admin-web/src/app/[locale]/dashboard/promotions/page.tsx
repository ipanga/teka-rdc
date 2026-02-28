'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface Promotion {
  id: string;
  type: string;
  title: { fr: string; en: string };
  description: { fr: string; en: string } | null;
  discountPercent: number | null;
  discountAmountCDF: number | null;
  targetType: string | null;
  targetId: string | null;
  targetName: string | null;
  startDate: string;
  endDate: string;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  data: Promotion[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface PromotionForm {
  type: string;
  titleFr: string;
  titleEn: string;
  descriptionFr: string;
  descriptionEn: string;
  discountPercent: string;
  discountAmountCDF: string;
  targetType: string;
  targetId: string;
  startDate: string;
  endDate: string;
}

const EMPTY_FORM: PromotionForm = {
  type: 'PROMOTION',
  titleFr: '',
  titleEn: '',
  descriptionFr: '',
  descriptionEn: '',
  discountPercent: '',
  discountAmountCDF: '',
  targetType: '',
  targetId: '',
  startDate: '',
  endDate: '',
};

const STATUS_TABS = ['', 'PROMOTION', 'FLASH_DEAL', 'PENDING_APPROVAL'];
const STATUS_TAB_KEYS: Record<string, string> = {
  '': 'all',
  'PROMOTION': 'promotionType',
  'FLASH_DEAL': 'flashDeal',
  'PENDING_APPROVAL': 'pendingApproval',
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-success/10 text-success',
  PENDING_APPROVAL: 'bg-warning/10 text-warning',
  APPROVED: 'bg-success/10 text-success',
  REJECTED: 'bg-destructive/10 text-destructive',
  EXPIRED: 'bg-gray-100 text-gray-700',
};

const TYPE_STYLES: Record<string, string> = {
  PROMOTION: 'bg-blue-100 text-blue-700',
  FLASH_DEAL: 'bg-orange-100 text-orange-700',
};

export default function PromotionsPage() {
  const t = useTranslations('Promotions');
  const tCommon = useTranslations('Common');

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [tabFilter, setTabFilter] = useState('');

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<PromotionForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Reject modal
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchPromotions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (tabFilter === 'PROMOTION' || tabFilter === 'FLASH_DEAL') {
        params.set('type', tabFilter);
      }
      if (tabFilter === 'PENDING_APPROVAL') {
        params.set('status', 'PENDING_APPROVAL');
      }
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/promotions?${params}`);
      setPromotions(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  }, [page, tabFilter]);

  useEffect(() => {
    fetchPromotions();
  }, [fetchPromotions]);

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        type: form.type,
        title: { fr: form.titleFr, en: form.titleEn },
        description: { fr: form.descriptionFr, en: form.descriptionEn },
        startDate: form.startDate,
        endDate: form.endDate,
      };
      if (form.discountPercent) {
        body.discountPercent = parseFloat(form.discountPercent);
      }
      if (form.discountAmountCDF) {
        body.discountAmountCDF = parseInt(form.discountAmountCDF);
      }
      if (form.targetType) {
        body.targetType = form.targetType;
      }
      if (form.targetId) {
        body.targetId = form.targetId;
      }

      await apiFetch('/v1/admin/promotions', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      setShowModal(false);
      setForm(EMPTY_FORM);
      showFeedback('success', t('created'));
      fetchPromotions();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiFetch(`/v1/admin/promotions/${id}/approve`, { method: 'POST' });
      showFeedback('success', t('approved'));
      fetchPromotions();
    } catch {
      showFeedback('error', t('error'));
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    setIsRejecting(true);
    try {
      await apiFetch(`/v1/admin/promotions/${rejectingId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectionReason }),
      });
      setRejectingId(null);
      setRejectionReason('');
      showFeedback('success', t('rejected'));
      fetchPromotions();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsRejecting(false);
    }
  };

  const formatDiscount = (promo: Promotion) => {
    if (promo.discountPercent) return `${promo.discountPercent}%`;
    if (promo.discountAmountCDF) {
      return new Intl.NumberFormat('fr-CD', {
        style: 'currency',
        currency: 'CDF',
        maximumFractionDigits: 0,
      }).format(promo.discountAmountCDF / 100);
    }
    return '-';
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT': return t('statusDraft');
      case 'ACTIVE': return t('statusActive');
      case 'PENDING_APPROVAL': return t('statusPending');
      case 'APPROVED': return t('statusApproved');
      case 'REJECTED': return t('statusRejected');
      case 'EXPIRED': return t('statusExpired');
      default: return status;
    }
  };

  return (
    <div className="p-8">
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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <button
          onClick={() => { setForm(EMPTY_FORM); setShowModal(true); }}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          {t('create')}
        </button>
      </div>

      {/* Tab filters */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => { setTabFilter(tab); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              tabFilter === tab
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {t(STATUS_TAB_KEYS[tab])}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('type')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('titleLabel')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('discount')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('target')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dates')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : promotions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noPromotions')}
                </td>
              </tr>
            ) : (
              promotions.map((promo) => (
                <tr key={promo.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[promo.type] || 'bg-gray-100 text-gray-700'}`}>
                      {promo.type === 'FLASH_DEAL' ? t('flashDeal') : t('promotionType')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[200px] truncate">
                    {promo.title?.fr || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {formatDiscount(promo)}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground max-w-[150px] truncate">
                    {promo.targetName || promo.targetType || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {promo.startDate ? new Date(promo.startDate).toLocaleDateString('fr-CD') : '-'}
                    {' - '}
                    {promo.endDate ? new Date(promo.endDate).toLocaleDateString('fr-CD') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[promo.status] || 'bg-gray-100 text-gray-700'}`}>
                      {statusLabel(promo.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {promo.status === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            onClick={() => handleApprove(promo.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                          >
                            {t('approve')}
                          </button>
                          <button
                            onClick={() => setRejectingId(promo.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                          >
                            {t('reject')}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('previous')}
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tCommon('next')}
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">{t('create')}</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('type')}</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="PROMOTION">{t('promotionType')}</option>
                    <option value="FLASH_DEAL">{t('flashDeal')}</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('titleFr')}</label>
                    <input
                      type="text"
                      value={form.titleFr}
                      onChange={(e) => setForm({ ...form, titleFr: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('titleEn')}</label>
                    <input
                      type="text"
                      value={form.titleEn}
                      onChange={(e) => setForm({ ...form, titleEn: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('descriptionFr')}</label>
                    <textarea
                      value={form.descriptionFr}
                      onChange={(e) => setForm({ ...form, descriptionFr: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      rows={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('descriptionEn')}</label>
                    <textarea
                      value={form.descriptionEn}
                      onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      rows={2}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('discountPercent')}</label>
                    <input
                      type="number"
                      value={form.discountPercent}
                      onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                      placeholder="10"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('discountAmountCDF')}</label>
                    <input
                      type="number"
                      value={form.discountAmountCDF}
                      onChange={(e) => setForm({ ...form, discountAmountCDF: e.target.value })}
                      placeholder="50000"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('targetType')}</label>
                    <select
                      value={form.targetType}
                      onChange={(e) => setForm({ ...form, targetType: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">-</option>
                      <option value="product">{t('targetProduct')}</option>
                      <option value="category">{t('targetCategory')}</option>
                      <option value="seller">{t('targetSeller')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('targetId')}</label>
                    <input
                      type="text"
                      value={form.targetId}
                      onChange={(e) => setForm({ ...form, targetId: e.target.value })}
                      placeholder="UUID"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('startDate')}</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('endDate')}</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isSaving || !form.titleFr}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? tCommon('loading') : tCommon('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setRejectingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('reject')}</h3>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={t('rejectionReasonPlaceholder')}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 mb-4"
                rows={3}
              />
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setRejectingId(null); setRejectionReason(''); }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleReject}
                  disabled={isRejecting || !rejectionReason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRejecting ? tCommon('loading') : tCommon('confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
