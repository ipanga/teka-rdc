'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface DeliveryZone {
  id: string;
  fromTown: string;
  toTown: string;
  feeCDF: string;
  feeUSD?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface DeliveryZoneFormData {
  fromTown: string;
  toTown: string;
  feeCDF: string;
  feeUSD?: string;
  isActive: boolean;
}

export default function DeliveryZonesPage() {
  const t = useTranslations('DeliveryZones');
  const tCommon = useTranslations('Common');

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [formFromTown, setFormFromTown] = useState('');
  const [formToTown, setFormToTown] = useState('');
  const [formFeeCDF, setFormFeeCDF] = useState('');
  const [formFeeUSD, setFormFeeUSD] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);

  // Delete confirm state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const showFeedbackMessage = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchZones = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: DeliveryZone[] } | DeliveryZone[]>('/v1/admin/delivery-zones');
      const data = Array.isArray(res.data) ? res.data : (res.data as { data: DeliveryZone[] }).data;
      setZones(data);
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  const openCreateModal = () => {
    setEditingZone(null);
    setFormFromTown('');
    setFormToTown('');
    setFormFeeCDF('');
    setFormFeeUSD('');
    setFormIsActive(true);
    setShowModal(true);
  };

  const openEditModal = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setFormFromTown(zone.fromTown);
    setFormToTown(zone.toTown);
    setFormFeeCDF(zone.feeCDF);
    setFormFeeUSD(zone.feeUSD || '');
    setFormIsActive(zone.isActive);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingZone(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFromTown.trim() || !formToTown.trim() || !formFeeCDF.trim()) return;

    setIsSaving(true);
    try {
      const body: DeliveryZoneFormData = {
        fromTown: formFromTown.trim(),
        toTown: formToTown.trim(),
        feeCDF: formFeeCDF.trim(),
        feeUSD: formFeeUSD.trim() || undefined,
        isActive: formIsActive,
      };

      if (editingZone) {
        await apiFetch(`/v1/admin/delivery-zones/${editingZone.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/v1/admin/delivery-zones', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      showFeedbackMessage('success', t('saved'));
      closeModal();
      fetchZones();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      await apiFetch(`/v1/admin/delivery-zones/${deletingId}`, {
        method: 'DELETE',
      });
      showFeedbackMessage('success', t('deleted'));
      setDeletingId(null);
      fetchZones();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (zone: DeliveryZone) => {
    try {
      await apiFetch(`/v1/admin/delivery-zones/${zone.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !zone.isActive }),
      });
      fetchZones();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    }
  };

  const formatCDF = (centimes: string) => {
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'CDF',
      maximumFractionDigits: 0,
    }).format(Number(centimes) / 100);
  };

  const formatUSD = (centimes: string) => {
    return new Intl.NumberFormat('fr-CD', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(centimes) / 100);
  };

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

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          {t('create')}
        </button>
      </div>

      {/* Zones table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('fromTown')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('toTown')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('feeCDF')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('feeUSD')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('isActive')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('loading')}
                </td>
              </tr>
            ) : zones.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noZones')}
                </td>
              </tr>
            ) : (
              zones.map((zone) => (
                <tr key={zone.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {zone.fromTown}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {zone.toTown}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                    {formatCDF(zone.feeCDF)}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap">
                    {zone.feeUSD ? formatUSD(zone.feeUSD) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggleActive(zone)}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer transition-colors ${
                        zone.isActive
                          ? 'bg-success/10 text-success hover:bg-success/20'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {zone.isActive ? t('active') : t('inactive')}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(zone)}
                        className="px-2.5 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                      >
                        {t('edit')}
                      </button>
                      <button
                        onClick={() => setDeletingId(zone.id)}
                        className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={closeModal} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                {editingZone ? t('editZone') : t('newZone')}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('fromTown')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formFromTown}
                  onChange={(e) => setFormFromTown(e.target.value)}
                  required
                  placeholder={t('townPlaceholder')}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  {t('toTown')} <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formToTown}
                  onChange={(e) => setFormToTown(e.target.value)}
                  required
                  placeholder={t('townPlaceholder')}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('feeCDF')} <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    value={formFeeCDF}
                    onChange={(e) => setFormFeeCDF(e.target.value)}
                    required
                    min="0"
                    placeholder={t('feePlaceholder')}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    {t('feeUSD')}
                  </label>
                  <input
                    type="number"
                    value={formFeeUSD}
                    onChange={(e) => setFormFeeUSD(e.target.value)}
                    min="0"
                    placeholder={t('feePlaceholder')}
                    className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="zoneIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
                />
                <label htmlFor="zoneIsActive" className="text-sm font-medium text-foreground">
                  {t('isActive')}
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  {tCommon('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formFromTown.trim() || !formToTown.trim() || !formFeeCDF.trim()}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? tCommon('loading') : t('save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('delete')}</h3>
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
                  {isDeleting ? tCommon('loading') : t('delete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
