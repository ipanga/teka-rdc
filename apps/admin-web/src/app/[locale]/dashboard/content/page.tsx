'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface ContentPage {
  id: string;
  slug: string;
  title: { fr: string; en: string };
  content: { fr: string; en: string };
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ContentForm {
  slug: string;
  customSlug: string;
  titleFr: string;
  titleEn: string;
  contentFr: string;
  contentEn: string;
  status: string;
  sortOrder: number;
}

const EMPTY_FORM: ContentForm = {
  slug: 'faq',
  customSlug: '',
  titleFr: '',
  titleEn: '',
  contentFr: '',
  contentEn: '',
  status: 'DRAFT',
  sortOrder: 0,
};

const PREDEFINED_SLUGS = ['faq', 'terms', 'privacy', 'help', 'about', 'contact'];

export default function ContentManagementPage() {
  const t = useTranslations('Content');
  const tCommon = useTranslations('Common');

  const [pages, setPages] = useState<ContentPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Edit
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContentForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [useCustomSlug, setUseCustomSlug] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Preview
  const [previewPage, setPreviewPage] = useState<ContentPage | null>(null);

  // Feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchPages = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<ContentPage[]>('/v1/admin/content');
      setPages(Array.isArray(res.data) ? res.data : []);
    } catch {
      // handled
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPages();
  }, [fetchPages]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setUseCustomSlug(false);
    setShowModal(true);
  };

  const openEdit = (page: ContentPage) => {
    setEditingId(page.id);
    const isPredefined = PREDEFINED_SLUGS.includes(page.slug);
    setUseCustomSlug(!isPredefined);
    setForm({
      slug: isPredefined ? page.slug : 'custom',
      customSlug: isPredefined ? '' : page.slug,
      titleFr: page.title?.fr || '',
      titleEn: page.title?.en || '',
      contentFr: page.content?.fr || '',
      contentEn: page.content?.en || '',
      status: page.status || 'DRAFT',
      sortOrder: page.sortOrder || 0,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const slug = useCustomSlug ? form.customSlug : form.slug;
      const body = {
        slug,
        title: { fr: form.titleFr, en: form.titleEn },
        content: { fr: form.contentFr, en: form.contentEn },
        status: form.status,
        sortOrder: form.sortOrder,
      };

      if (editingId) {
        await apiFetch(`/v1/admin/content/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch('/v1/admin/content', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      setShowModal(false);
      showFeedback('success', t('saved'));
      fetchPages();
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
      await apiFetch(`/v1/admin/content/${deletingId}`, { method: 'DELETE' });
      setDeletingId(null);
      showFeedback('success', t('deleted'));
      fetchPages();
    } catch {
      showFeedback('error', t('error'));
    } finally {
      setIsDeleting(false);
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
          onClick={openCreate}
          className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          {t('create')}
        </button>
      </div>

      {/* Content pages table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted">
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('slug')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('titleLabel')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('status')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('sortOrder')}</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted-foreground">{t('updatedAt')}</th>
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
            ) : pages.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {t('noContent')}
                </td>
              </tr>
            ) : (
              pages.map((pg) => (
                <tr key={pg.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{pg.slug}</td>
                  <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[200px] truncate">
                    {pg.title?.fr || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      pg.status === 'PUBLISHED'
                        ? 'bg-success/10 text-success'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {pg.status === 'PUBLISHED' ? t('published') : t('draft')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{pg.sortOrder}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(pg.updatedAt).toLocaleDateString('fr-CD')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPreviewPage(pg)}
                        className="px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                      >
                        {t('preview')}
                      </button>
                      <button
                        onClick={() => openEdit(pg)}
                        className="px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        {tCommon('edit')}
                      </button>
                      <button
                        onClick={() => setDeletingId(pg.id)}
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

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">
                {editingId ? t('editPage') : t('create')}
              </h3>

              <div className="space-y-4">
                {/* Slug */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('slug')}</label>
                  <div className="flex gap-2">
                    <select
                      value={useCustomSlug ? 'custom' : form.slug}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setUseCustomSlug(true);
                        } else {
                          setUseCustomSlug(false);
                          setForm({ ...form, slug: e.target.value });
                        }
                      }}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {PREDEFINED_SLUGS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                      <option value="custom">{t('customSlug')}</option>
                    </select>
                  </div>
                  {useCustomSlug && (
                    <input
                      type="text"
                      value={form.customSlug}
                      onChange={(e) => setForm({ ...form, customSlug: e.target.value })}
                      placeholder={t('customSlugPlaceholder')}
                      className="w-full mt-2 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  )}
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

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('contentFr')}</label>
                  <textarea
                    value={form.contentFr}
                    onChange={(e) => setForm({ ...form, contentFr: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    rows={8}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">{t('contentEn')}</label>
                  <textarea
                    value={form.contentEn}
                    onChange={(e) => setForm({ ...form, contentEn: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    rows={8}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('status')}</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="DRAFT">{t('draft')}</option>
                      <option value="PUBLISHED">{t('published')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">{t('sortOrder')}</label>
                    <input
                      type="number"
                      value={form.sortOrder}
                      onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
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

      {/* Preview Modal */}
      {previewPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setPreviewPage(null)} />
          <div className="relative bg-white rounded-xl border border-border shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">{t('preview')}</h3>
                <button
                  onClick={() => setPreviewPage(null)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {tCommon('close')}
                </button>
              </div>
              <div className="mb-2">
                <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                  /{previewPage.slug}
                </span>
              </div>
              <h4 className="text-xl font-bold text-foreground mb-4">{previewPage.title?.fr}</h4>
              <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
                {previewPage.content?.fr || t('noContentYet')}
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
