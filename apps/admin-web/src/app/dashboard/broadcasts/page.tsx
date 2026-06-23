'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface BroadcastChannels {
  push: boolean;
  email: boolean;
}

interface BroadcastForm {
  title: string;
  message: string;
  segment: string;
  channels: BroadcastChannels;
}

// Mirrors apps/api/src/broadcasts/broadcasts.service.ts BROADCAST_DEFAULT_CHANNELS.
const DEFAULT_CHANNELS: BroadcastChannels = {
  push: true,
  email: true,
};

const EMPTY_FORM: BroadcastForm = {
  title: '',
  message: '',
  segment: 'ALL_USERS',
  channels: { ...DEFAULT_CHANNELS },
};

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENDING: 'bg-warning/10 text-warning',
  SENT: 'bg-success/10 text-success',
  FAILED: 'bg-destructive/10 text-destructive',
};

const SEGMENTS = ['ALL_BUYERS', 'ALL_SELLERS', 'ALL_USERS'];

// API caps broadcast messages at 500 chars (raised from 160 in PR C2 once
// the SMS branch went away).
const MESSAGE_MAX_LENGTH = 500;

export default function BroadcastsPage() {
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
      const rd = res.data;
      if (Array.isArray(rd)) { setBroadcasts(rd); setTotalPages(1); }
      else { setBroadcasts(rd.data); setTotalPages(rd.pagination?.totalPages ?? 1); }
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
        body: JSON.stringify({
          title: form.title,
          message: form.message,
          segment: form.segment,
          channels: form.channels,
        }),
      });
      setShowCreateModal(false);
      setForm(EMPTY_FORM);
      showFeedback('success', "Diffusion créée avec succès");
      fetchBroadcasts();
    } catch {
      showFeedback('error', "Une erreur est survenue");
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
      showFeedback('success', "Diffusion envoyée avec succès");
      fetchBroadcasts();
    } catch {
      showFeedback('error', "Une erreur est survenue");
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
      showFeedback('success', "Diffusion supprimée");
      fetchBroadcasts();
    } catch {
      showFeedback('error', "Une erreur est survenue");
    } finally {
      setIsDeleting(false);
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'DRAFT': return "Brouillon";
      case 'SENDING': return "En cours d'envoi";
      case 'SENT': return "Envoyé";
      case 'FAILED': return "Échoué";
      default: return status;
    }
  };

  const segmentLabel = (segment: string) => {
    switch (segment) {
      case 'ALL_BUYERS': return "Tous les acheteurs";
      case 'ALL_SELLERS': return "Tous les vendeurs";
      case 'ALL_USERS': return "Tous les utilisateurs";
      default: return segment;
    }
  };

  const openSendConfirm = (broadcast: Broadcast) => {
    setSendingId(broadcast.id);
    setSendingBroadcast(broadcast);
  };

  const toggleChannel = (key: keyof BroadcastChannels) => {
    setForm((prev) => ({
      ...prev,
      channels: { ...prev.channels, [key]: !prev.channels[key] },
    }));
  };

  const hasAnyChannel = form.channels.push || form.channels.email;

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
        <h1 className="text-2xl font-bold text-foreground">Diffusions</h1>
        <button
          onClick={() => { setForm(EMPTY_FORM); setShowCreateModal(true); }}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Nouvelle diffusion
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Titre</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Message</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Segment</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Statut</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Résultats</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Chargement...
                </td>
              </tr>
            ) : broadcasts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Aucune diffusion trouvée
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
                          <span className="text-destructive ml-1">({bc.failedCount} échoué(s))</span>
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
                            Envoyer
                          </button>
                          <button
                            onClick={() => setDeletingId(bc.id)}
                            className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                          >
                            Supprimer
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
            Précédent
          </button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Suivant
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Nouvelle diffusion</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Titre</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Message</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    rows={4}
                    maxLength={MESSAGE_MAX_LENGTH}
                  />
                  <p className={`text-xs mt-1 ${form.message.length > MESSAGE_MAX_LENGTH ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {`${form.message.length}/${MESSAGE_MAX_LENGTH} caractères`}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Canaux de diffusion</label>
                  <div className="space-y-2">
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.channels.push}
                        onChange={() => toggleChannel('push')}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">Notification push</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Envoyée aux appareils mobiles connectés</div>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.channels.email}
                        onChange={() => toggleChannel('email')}
                        className="mt-0.5 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">Email</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Envoyée aux utilisateurs ayant un email enregistré</div>
                      </div>
                    </label>
                  </div>
                  {!hasAnyChannel && (
                    <p className="text-xs text-destructive mt-1">Sélectionnez au moins un canal</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Segment</label>
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
                  Annuler
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isSaving || !form.title || !form.message || !hasAnyChannel}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? "Chargement..." : "Enregistrer"}
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
              <h3 className="text-lg font-semibold text-foreground mb-2">Confirmer l&apos;envoi</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {`Êtes-vous sûr ? La diffusion sera envoyée à tous les utilisateurs du segment « ${segmentLabel(sendingBroadcast.segment)} » sur les canaux sélectionnés.`}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setSendingId(null); setSendingBroadcast(null); }}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSend}
                  disabled={isSending}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? "Chargement..." : "Envoyer"}
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
              <h3 className="text-lg font-semibold text-foreground mb-2">Supprimer la diffusion</h3>
              <p className="text-sm text-muted-foreground mb-4">Voulez-vous vraiment supprimer cette diffusion ?</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="px-4 py-2 text-sm font-medium text-white bg-destructive rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? "Chargement..." : "Confirmer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
