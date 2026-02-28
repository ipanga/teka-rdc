'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface Banner {
  id: string;
  title: { fr: string; en: string };
  subtitle: { fr: string; en: string } | null;
  imageUrl: string;
  linkType: string;
  linkTarget: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  status: string;
  createdAt: string;
}

interface PaginatedResponse {
  data: Banner[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface BannerForm {
  titleFr: string;
  titleEn: string;
  subtitleFr: string;
  subtitleEn: string;
  imageUrl: string;
  linkType: string;
  linkTarget: string;
  startDate: string;
  endDate: string;
  sortOrder: number;
  status: string;
}

const EMPTY_FORM: BannerForm = {
  titleFr: '',
  titleEn: '',
  subtitleFr: '',
  subtitleEn: '',
  imageUrl: '',
  linkType: 'url',
  linkTarget: '',
  startDate: '',
  endDate: '',
  sortOrder: 0,
  status: 'DRAFT',
};

const STATUS_TABS = ['', 'DRAFT', 'ACTIVE', 'SCHEDULED', 'EXPIRED'];

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-success/10 text-success',
  SCHEDULED: 'bg-blue-100 text-blue-700',
  EXPIRED: 'bg-warning/10 text-warning',
};

const LINK_TYPES = ['product', 'category', 'promotion', 'url'];

export default function BannersPage() {
  const t = useTranslations('Banners');
  const tCommon = useTranslations('Common');

  const [banners, setBanners] = useState<Banner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<BannerForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchBanners = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/banners?${params}`);
      setBanners(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchBanners();
  }, [fetchBanners]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (banner: Banner) => {
    setEditingId(banner.id);
    setForm({
      titleFr: banner.title?.fr || '',
      titleEn: banner.title?.en || '',
      subtitleFr: banner.subtitle?.fr || '',
      subtitleEn: banner.subtitle?.en || '',
      imageUrl: banner.imageUrl || '',
      linkType: banner.linkType || 'url',
      linkTarget: banner.linkTarget || '',
      startDate: banner.startDate ? banner.startDate.slice(0, 10) : '',
      endDate: banner.endDate ? banner.endDate.slice(0, 10) : '',
      sortOrder: banner.sortOrder || 0,
      status: banner.status || 'DRAFT',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const body = {
        title: { fr: form.titleFr, en: form.titleEn },
        subtitle: { fr: form.subtitleFr, en: form.subtitleEn },
        imageUrl: form.imageUrl,
        linkType: form.linkType,
        linkTarget: form.linkTarget,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        sortOrder: form.sortOrder,
        status: form.status,
      };

      if (editingId) {
        await apiFetch(`/v1/admin/banners/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/v1/admin/banners', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      setShowModal(false);
      showFeedback('success', t('saved'));
      fetchBanners();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/v1/admin/banners/${deletingId}`, { method: 'DELETE' });
      setDeletingId(null);
      showFeedback('success', t('deleted'));
      fetchBanners();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT': return t('statusDraft');
      case 'ACTIVE': return t('statusActive');
      case 'SCHEDULED': return t('statusScheduled');
      case 'EXPIRED': return t('statusExpired');
      default: return status;
    }
  };

  const tabLabel = (status: string) => {
    if (!status) return t('all');
    return statusLabel(status);
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
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          {t('create')}
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_TABS.map((status) => (
          <button
            key={status}
            onClick={() => { setStatusFilter(status); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              statusFilter === status
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-foreground border-border hover:bg-muted'
            }`}
          >
            {tabLabel(status)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('image')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('titleLabel')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('dates')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('sortOrder')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{tCommon('actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {tCommon('loading')}
                </td>
              </tr>
            ) : banners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noBanners')}
                </td>
              </tr>
            ) : (
              banners.map((banner) => (
                <tr key={banner.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    {banner.imageUrl ? (
                      <img
                        src={banner.imageUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">--</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[200px] truncate">
                    {banner.title?.fr || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[banner.status] || 'bg-gray-100 text-gray-700'}`}>
                      {statusLabel(banner.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {banner.startDate ? new Date(banner.startDate).toLocaleDateString('fr-CD') : '-'}
                    {' - '}
                    {banner.endDate ? new Date(banner.endDate).toLocaleDateString('fr-CD') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{banner.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(banner)}
                        className="px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        {tCommon('edit')}
                      </button>
                      <button
                        onClick={() => setDeletingId(banner.id)}
                        className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                      >
                        {tCommon('delete')}
                      </button>
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {editingId ? t('edit') : t('create')}
              </h3>

              <div className="space-y-4">
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
                    <label className="block text-sm font-medium text-foreground mb-1">{t('subtitleFr')}</label>
                    <input
                      type="text"
                      value={form.subtitleFr}
                      onChange={(e) => setForm({ ...form, subtitleFr: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('subtitleEn')}</label>
                    <input
                      type="text"
                      value={form.subtitleEn}
                      onChange={(e) => setForm({ ...form, subtitleEn: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('imageUrl')}</label>
                  <input
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="https://..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('linkType')}</label>
                    <select
                      value={form.linkType}
                      onChange={(e) => setForm({ ...form, linkType: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {LINK_TYPES.map((lt) => (
                        <option key={lt} value={lt}>{lt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('linkTarget')}</label>
                    <input
                      type="text"
                      value={form.linkTarget}
                      onChange={(e) => setForm({ ...form, linkTarget: e.target.value })}
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

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('sortOrder')}</label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('status')}</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="DRAFT">{t('statusDraft')}</option>
                      <option value="ACTIVE">{t('statusActive')}</option>
                      <option value="SCHEDULED">{t('statusScheduled')}</option>
                    </select>
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
                  onClick={handleSave}
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

      {/* Delete Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('deleteTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('deleteConfirm')}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? tCommon('loading') : tCommon('confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
