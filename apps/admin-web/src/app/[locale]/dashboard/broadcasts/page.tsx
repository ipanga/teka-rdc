'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface Broadcast {
  id: string;
  title: string;
  message: string;
  segment: string;
  status: string;
  sentCount: number | null;
  failedCount: number | null;
  totalRecipients: number | null;
  createdAt: string;
  sentAt: string | null;
}

interface PaginatedResponse {
  data: Broadcast[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface BroadcastForm {
  title: string;
  message: string;
  segment: string;
}

const EMPTY_FORM: BroadcastForm = {
  title: '',
  message: '',
  segment: 'ALL_USERS',
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENDING: 'bg-warning/10 text-warning',
  SENT: 'bg-success/10 text-success',
  FAILED: 'bg-destructive/10 text-destructive',
};

const SEGMENTS = ['ALL_BUYERS', 'ALL_SELLERS', 'ALL_USERS'];

const SMS_MAX_LENGTH = 160;

export default function BroadcastsPage() {
  const t = useTranslations('Broadcasts');
  const tCommon = useTranslations('Common');

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Create
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState<BroadcastForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  // Send confirm
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendingBroadcast, setSendingBroadcast] = useState<Broadcast | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchBroadcasts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      const res = await apiFetch<PaginatedResponse>(`/v1/admin/broadcasts?${params}`);
      setBroadcasts(res.data.data);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchBroadcasts();
  }, [fetchBroadcasts]);

  const handleCreate = async () => {
    setIsSaving(true);
    try {
      await apiFetch('/v1/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      showFeedback('success', t('created'));
      fetchBroadcasts();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSend = async () => {
    if (!sendingId) return;
    setIsSending(true);
    try {
      await apiFetch(`/v1/admin/broadcasts/${sendingId}/send`, { method: 'POST' });
      setSendingId(null);
      setSendingBroadcast(null);
      showFeedback('success', t('sent'));
      fetchBroadcasts();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsSending(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/v1/admin/broadcasts/${deletingId}`, { method: 'DELETE' });
      setDeletingId(null);
      showFeedback('success', t('deleted'));
      fetchBroadcasts();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT': return t('statusDraft');
      case 'SENDING': return t('statusSending');
      case 'SENT': return t('statusSent');
      case 'FAILED': return t('statusFailed');
      default: return status;
    }
  };

  const segmentLabel = (segment: string) => {
    switch (segment) {
      case 'ALL_BUYERS': return t('allBuyers');
      case 'ALL_SELLERS': return t('allSellers');
      case 'ALL_USERS': return t('allUsers');
      default: return segment;
    }
  };

  const openSendConfirm = (broadcast: Broadcast) => {
    setSendingId(broadcast.id);
    setSendingBroadcast(broadcast);
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
          onClick={() => { setForm(EMPTY_FORM); setShowCreateModal(true); }}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          {t('create')}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('date')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('titleLabel')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('messageLabel')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('segment')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('results')}</th>
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
            ) : broadcasts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noBroadcasts')}
                </td>
              </tr>
            ) : (
              broadcasts.map((bc) => (
                <tr key={bc.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(bc.createdAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[150px] truncate">
                    {bc.title}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground max-w-[200px] truncate">
                    {bc.message}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {segmentLabel(bc.segment)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[bc.status] || 'bg-gray-100 text-gray-700'}`}>
                      {statusLabel(bc.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {bc.status === 'SENT' || bc.status === 'FAILED' ? (
                      <span>
                        {bc.sentCount ?? 0} / {bc.totalRecipients ?? 0}
                        {bc.failedCount ? (
                          <span className="text-destructive ml-1">({bc.failedCount} {t('failed')})</span>
                        ) : null}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {bc.status === 'DRAFT' && (
                        <>
                          <button
                            onClick={() => openSendConfirm(bc)}
                            className="px-2.5 py-1 text-xs font-medium bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                          >
                            {t('send')}
                          </button>
                          <button
                            onClick={() => setDeletingId(bc.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                          >
                            {tCommon('delete')}
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
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">{t('create')}</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('titleLabel')}</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('messageLabel')}</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    rows={4}
                    maxLength={SMS_MAX_LENGTH}
                  />
                  <p className={`text-xs mt-1 ${form.message.length > SMS_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {t('characterCount', { count: form.message.length, max: SMS_MAX_LENGTH })}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('segment')}</label>
                  <select
                    value={form.segment}
                    onChange={(e) => setForm({ ...form, segment: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {SEGMENTS.map((seg) => (
                      <option key={seg} value={seg}>{segmentLabel(seg)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isSaving || !form.title || !form.message}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? tCommon('loading') : tCommon('save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Confirmation Modal */}
      {sendingId && sendingBroadcast && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => { setSendingId(null); setSendingBroadcast(null); }} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('confirmSendTitle')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t('confirmSendMessage', { segment: segmentLabel(sendingBroadcast.segment) })}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setSendingId(null); setSendingBroadcast(null); }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? tCommon('loading') : t('send')}
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
