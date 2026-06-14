'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

interface Brand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  productCount: number;
  categoryIds: string[];
}

interface SubCat {
  id: string;
  name: string;
  isActive: boolean;
}

interface TopCat {
  id: string;
  name: string;
  emoji?: string | null;
  isActive: boolean;
  subcategories?: SubCat[];
}

export default function BrandsPage() {
  const t = useTranslations('Brands');
  const tc = useTranslations('Common');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [tree, setTree] = useState<TopCat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Brand modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [fName, setFName] = useState('');
  const [fLogo, setFLogo] = useState('');
  const [fSort, setFSort] = useState(0);
  const [fActive, setFActive] = useState(true);
  const [fCats, setFCats] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Merge modal
  const [mergeSource, setMergeSource] = useState<Brand | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const fetchBrands = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiFetch<Brand[]>('/v1/admin/brands');
      setBrands(res.data);
    } catch {
      showFeedback('error', t('errorSaving'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const fetchTree = useCallback(async () => {
    try {
      const res = await apiFetch<TopCat[] | { data: TopCat[] }>('/v1/admin/categories');
      const data = Array.isArray(res.data) ? res.data : res.data.data;
      // Only the strict active taxonomy is offered for brand links.
      setTree(
        data
          .filter((c) => c.isActive)
          .map((c) => ({
            ...c,
            subcategories: (c.subcategories ?? []).filter((s) => s.isActive),
          })),
      );
    } catch {
      setTree([]);
    }
  }, []);

  useEffect(() => {
    fetchBrands();
    fetchTree();
  }, [fetchBrands, fetchTree]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(q));
  }, [brands, search]);

  const openCreate = () => {
    setEditing(null);
    setFName('');
    setFLogo('');
    setFSort(0);
    setFActive(true);
    setFCats(new Set());
    setShowModal(true);
  };

  const openEdit = (b: Brand) => {
    setEditing(b);
    setFName(b.name);
    setFLogo(b.logoUrl ?? '');
    setFSort(b.sortOrder);
    setFActive(b.isActive);
    setFCats(new Set(b.categoryIds));
    setShowModal(true);
  };

  const toggleCat = (id: string) => {
    setFCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!fName.trim()) {
      showFeedback('error', t('nameRequired'));
      return;
    }
    setIsSaving(true);
    try {
      const body = {
        name: fName.trim(),
        logoUrl: fLogo.trim() || undefined,
        sortOrder: fSort,
        isActive: fActive,
        categoryIds: Array.from(fCats),
      };
      if (editing) {
        await apiFetch(`/v1/admin/brands/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/v1/admin/brands', { method: 'POST', body: JSON.stringify(body) });
      }
      setShowModal(false);
      fetchBrands();
      showFeedback('success', t('saveSuccess'));
    } catch {
      showFeedback('error', t('errorSaving'));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (b: Brand) => {
    try {
      await apiFetch(`/v1/admin/brands/${b.id}/${b.isActive ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      fetchBrands();
    } catch {
      showFeedback('error', t('errorSaving'));
    }
  };

  const doDelete = async (id: string) => {
    try {
      await apiFetch(`/v1/admin/brands/${id}`, { method: 'DELETE' });
      setDeletingId(null);
      fetchBrands();
      showFeedback('success', t('deleteSuccess'));
    } catch {
      showFeedback('error', t('errorDeleting'));
    }
  };

  const doMerge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    setIsMerging(true);
    try {
      await apiFetch(`/v1/admin/brands/${mergeSource.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ targetBrandId: mergeTargetId }),
      });
      setMergeSource(null);
      setMergeTargetId('');
      fetchBrands();
      showFeedback('success', t('mergeSuccess'));
    } catch {
      showFeedback('error', t('errorMerging'));
    } finally {
      setIsMerging(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{tc('loading')}</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {feedback && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {feedback.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          + {t('newBrand')}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{t('subtitle')}</p>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('search')}
        className="w-full mb-4 px-3 py-2 border border-border rounded-lg text-sm bg-white"
      />

      <div className="bg-white rounded-xl border border-border shadow-sm">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground text-sm">
            {brands.length === 0 ? t('noBrands') : t('noBrandsFound')}
          </p>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((b) => (
              <div key={b.id} className="flex items-center justify-between p-4 gap-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {b.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.logoUrl} alt={b.name} className="w-9 h-9 rounded object-contain bg-muted/40 shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-muted/60 flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                      {b.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground truncate">{b.name}</span>
                      {!b.isActive && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t('inactive')}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{t('productCount', { count: b.productCount })}</span>
                      <span>{t('categoryCount', { count: b.categoryIds.length })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(b)} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors">
                    {b.isActive ? t('disable') : t('enable')}
                  </button>
                  <button onClick={() => openEdit(b)} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors">
                    {tc('edit')}
                  </button>
                  <button onClick={() => { setMergeSource(b); setMergeTargetId(''); }} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors">
                    {t('merge')}
                  </button>
                  <button onClick={() => setDeletingId(b.id)} className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    {t('delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Brand create/edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">{editing ? t('editBrand') : t('newBrand')}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('name')}</label>
                <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('logoUrl')}</label>
                <input type="text" value={fLogo} onChange={(e) => setFLogo(e.target.value)} placeholder="https://…" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1">{t('sortOrder')}</label>
                  <input type="number" value={fSort} onChange={(e) => setFSort(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <label className="flex items-center gap-2 mt-6 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} />
                  {t('active')}
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{t('subcategories')}</label>
                <p className="text-xs text-muted-foreground mb-2">{t('subcategoriesHint')}</p>
                <div className="border border-border rounded-lg max-h-56 overflow-y-auto divide-y divide-border">
                  {tree.map((top) => (
                    <div key={top.id} className="p-2">
                      <div className="text-xs font-semibold text-muted-foreground mb-1">{top.emoji} {top.name}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {(top.subcategories ?? []).map((sub) => (
                          <label key={sub.id} className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                            <input type="checkbox" checked={fCats.has(sub.id)} onChange={() => toggleCat(sub.id)} />
                            <span className="truncate">{sub.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50">{t('cancel')}</button>
              <button onClick={save} disabled={isSaving} className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50">{t('save')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeSource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMergeSource(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">{t('mergeTitle')}</h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-foreground">{t('mergeIntoLabel', { name: mergeSource.name })}</p>
              <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                <option value="">{t('selectTarget')}</option>
                {brands.filter((b) => b.id !== mergeSource.id).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{t('mergeWarning', { name: mergeSource.name })}</p>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setMergeSource(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50">{t('cancel')}</button>
              <button onClick={doMerge} disabled={!mergeTargetId || isMerging} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{t('merge')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeletingId(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <p className="text-sm text-foreground">{t('confirmDelete')}</p>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-2">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50">{t('cancel')}</button>
              <button onClick={() => doDelete(deletingId)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
