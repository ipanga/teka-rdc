'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface CategoryOverride {
  categoryId: string;
  categoryName: string;
  rate: number;
}

interface CommissionSettings {
  globalRate: number;
  categoryOverrides: CategoryOverride[];
}

interface Category {
  id: string;
  name: Record<string, string>;
}

export default function CommissionPage() {
  const t = useTranslations('Commission');
  const tCommon = useTranslations('Common');

  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Global rate editing
  const [globalRateInput, setGlobalRateInput] = useState('');
  const [isSavingGlobal, setIsSavingGlobal] = useState(false);

  // Add override form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCategoryId, setAddCategoryId] = useState('');
  const [addRate, setAddRate] = useState('');
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  // Edit override inline
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete confirm
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedbackMessage = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<CommissionSettings>('/v1/admin/commission-settings');
      setSettings(res.data);
      setGlobalRateInput(String(Math.round(res.data.globalRate * 100)));
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch<Category[]>('/v1/categories');
      setCategories(res.data);
    } catch {
      // Error handled by apiFetch
    }
  }, []);

  useEffect(() => {
    fetchSettings();
    fetchCategories();
  }, [fetchSettings, fetchCategories]);

  const handleSaveGlobalRate = async () => {
    const ratePercent = Number(globalRateInput);
    if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) return;

    setIsSavingGlobal(true);
    try {
      await apiFetch('/v1/admin/commission-settings', {
        method: 'PUT',
        body: JSON.stringify({ rate: ratePercent / 100 }),
      });
      showFeedbackMessage('success', t('saved'));
      fetchSettings();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsSavingGlobal(false);
    }
  };

  const handleAddOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addCategoryId || !addRate.trim()) return;

    const ratePercent = Number(addRate);
    if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) return;

    setIsSavingOverride(true);
    try {
      await apiFetch(`/v1/admin/commission-settings/${addCategoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ rate: ratePercent / 100 }),
      });
      showFeedbackMessage('success', t('saved'));
      setShowAddForm(false);
      setAddCategoryId('');
      setAddRate('');
      fetchSettings();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleSaveEdit = async (categoryId: string) => {
    const ratePercent = Number(editRate);
    if (isNaN(ratePercent) || ratePercent < 0 || ratePercent > 100) return;

    setIsSavingEdit(true);
    try {
      await apiFetch(`/v1/admin/commission-settings/${categoryId}`, {
        method: 'PUT',
        body: JSON.stringify({ rate: ratePercent / 100 }),
      });
      showFeedbackMessage('success', t('saved'));
      setEditingCategoryId(null);
      setEditRate('');
      fetchSettings();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategoryId) return;

    setIsDeleting(true);
    try {
      await apiFetch(`/v1/admin/commission-settings/${deletingCategoryId}`, {
        method: 'DELETE',
      });
      showFeedbackMessage('success', t('saved'));
      setDeletingCategoryId(null);
      fetchSettings();
    } catch {
      showFeedbackMessage('error', 'Erreur');
    } finally {
      setIsDeleting(false);
    }
  };

  const getCategoryName = (name: Record<string, string>) => {
    return name.fr || name.en || Object.values(name)[0] || '-';
  };

  // Filter out categories that already have overrides for the add form
  const availableCategories = categories.filter(
    (cat) => !settings?.categoryOverrides.some((ov) => ov.categoryId === cat.id)
  );

  if (isLoading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
        <p className="text-muted-foreground">{tCommon('loading')}</p>
      </div>
    );
  }

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

      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      {/* Global rate card */}
      <div className="bg-white rounded-xl border border-border p-6 mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-1">{t('globalRate')}</h2>
        <p className="text-sm text-muted-foreground mb-4">{t('globalRateDescription')}</p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={globalRateInput}
              onChange={(e) => setGlobalRateInput(e.target.value)}
              min="0"
              max="100"
              step="0.1"
              className="w-24 px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
          <button
            onClick={handleSaveGlobalRate}
            disabled={isSavingGlobal}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSavingGlobal ? tCommon('loading') : t('save')}
          </button>
        </div>
      </div>

      {/* Category overrides */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">{t('categoryOverrides')}</h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors text-sm"
        >
          {t('addOverride')}
        </button>
      </div>

      {/* Add override form */}
      {showAddForm && (
        <form onSubmit={handleAddOverride} className="bg-white rounded-xl border border-border p-6 mb-4">
          <div className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('category')} <span className="text-destructive">*</span>
              </label>
              <select
                value={addCategoryId}
                onChange={(e) => setAddCategoryId(e.target.value)}
                required
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">--</option>
                {availableCategories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {getCategoryName(cat.name)}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-foreground mb-1">
                {t('rate')} <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                value={addRate}
                onChange={(e) => setAddRate(e.target.value)}
                required
                min="0"
                max="100"
                step="0.1"
                placeholder="0-100"
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setAddCategoryId('');
                  setAddRate('');
                }}
                className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSavingOverride || !addCategoryId || !addRate.trim()}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingOverride ? tCommon('loading') : t('save')}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Overrides table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('category')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('rate')}
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">
                {t('actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {!settings?.categoryOverrides.length ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noOverrides')}
                </td>
              </tr>
            ) : (
              settings.categoryOverrides.map((override) => (
                <tr key={override.categoryId} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">
                    {override.categoryName}
                  </td>
                  <td className="px-4 py-3 text-sm text-foreground">
                    {editingCategoryId === override.categoryId ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={editRate}
                          onChange={(e) => setEditRate(e.target.value)}
                          min="0"
                          max="100"
                          step="0.1"
                          className="w-20 px-2 py-1 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center text-sm"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                        <button
                          onClick={() => handleSaveEdit(override.categoryId)}
                          disabled={isSavingEdit || !editRate.trim()}
                          className="px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSavingEdit ? '...' : t('save')}
                        </button>
                        <button
                          onClick={() => {
                            setEditingCategoryId(null);
                            setEditRate('');
                          }}
                          className="px-2 py-1 text-xs font-medium bg-background text-foreground border border-border rounded-lg hover:bg-muted transition-colors"
                        >
                          {tCommon('cancel')}
                        </button>
                      </div>
                    ) : (
                      `${Math.round(override.rate * 100 * 10) / 10}%`
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editingCategoryId !== override.categoryId && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditingCategoryId(override.categoryId);
                            setEditRate(String(Math.round(override.rate * 100 * 10) / 10));
                          }}
                          className="px-2.5 py-1 text-xs font-medium bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                          {tCommon('edit')}
                        </button>
                        <button
                          onClick={() => setDeletingCategoryId(override.categoryId)}
                          className="px-2.5 py-1 text-xs font-medium bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                        >
                          {t('delete')}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deletingCategoryId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setDeletingCategoryId(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-sm mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('delete')}</h3>
              <p className="text-sm text-muted-foreground mb-4">{t('deleteConfirm')}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setDeletingCategoryId(null)}
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
