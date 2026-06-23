'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';

const map: Record<string, string> = {
  "Common.loading": "Chargement...",
  "Common.edit": "Modifier",
  "Brands.title": "Gestion des marques",
  "Brands.subtitle": "Bibliothèque de marques réutilisable pour tout le catalogue",
  "Brands.newBrand": "Nouvelle marque",
  "Brands.editBrand": "Modifier la marque",
  "Brands.name": "Nom",
  "Brands.logoUrl": "URL du logo (optionnel)",
  "Brands.sortOrder": "Ordre d'affichage",
  "Brands.active": "Active",
  "Brands.inactive": "Inactive",
  "Brands.enable": "Activer",
  "Brands.disable": "Désactiver",
  "Brands.subcategories": "Sous-catégories",
  "Brands.subcategoriesHint": "Sélectionnez les sous-catégories où cette marque est proposée",
  "Brands.search": "Rechercher une marque",
  "Brands.merge": "Fusionner",
  "Brands.mergeTitle": "Fusionner la marque",
  "Brands.selectTarget": "Sélectionner la marque cible",
  "Brands.delete": "Supprimer",
  "Brands.confirmDelete": "Êtes-vous sûr de vouloir supprimer cette marque ? Ses produits conserveront leur référence mais elle disparaîtra des filtres.",
  "Brands.noBrands": "Aucune marque configurée",
  "Brands.noBrandsFound": "Aucune marque ne correspond à votre recherche",
  "Brands.save": "Enregistrer",
  "Brands.cancel": "Annuler",
  "Brands.saveSuccess": "Marque enregistrée avec succès",
  "Brands.deleteSuccess": "Marque supprimée",
  "Brands.mergeSuccess": "Marques fusionnées avec succès",
  "Brands.errorSaving": "Erreur lors de l'enregistrement",
  "Brands.errorDeleting": "Erreur lors de la suppression",
  "Brands.errorMerging": "Erreur lors de la fusion",
  "Brands.nameRequired": "Le nom de la marque est requis",
};

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
      showFeedback('error', map["Brands.errorSaving"]);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      showFeedback('error', map["Brands.nameRequired"]);
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
      showFeedback('success', map["Brands.saveSuccess"]);
    } catch {
      showFeedback('error', map["Brands.errorSaving"]);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (b: Brand) => {
    try {
      await apiFetch(`/v1/admin/brands/${b.id}/${b.isActive ? 'deactivate' : 'activate'}`, { method: 'PATCH' });
      fetchBrands();
    } catch {
      showFeedback('error', map["Brands.errorSaving"]);
    }
  };

  const doDelete = async (id: string) => {
    try {
      await apiFetch(`/v1/admin/brands/${id}`, { method: 'DELETE' });
      setDeletingId(null);
      fetchBrands();
      showFeedback('success', map["Brands.deleteSuccess"]);
    } catch {
      showFeedback('error', map["Brands.errorDeleting"]);
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
      showFeedback('success', map["Brands.mergeSuccess"]);
    } catch {
      showFeedback('error', map["Brands.errorMerging"]);
    } finally {
      setIsMerging(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">{map["Common.loading"]}</div>;
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
        <h1 className="text-2xl font-bold text-foreground">{map["Brands.title"]}</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
          + {map["Brands.newBrand"]}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">{map["Brands.subtitle"]}</p>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={map["Brands.search"]}
        className="w-full mb-4 px-3 py-2 border border-border rounded-lg text-sm bg-white"
      />

      <div className="bg-white rounded-xl border border-border shadow-sm">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-muted-foreground text-sm">
            {brands.length === 0 ? map["Brands.noBrands"] : map["Brands.noBrandsFound"]}
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
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{map["Brands.inactive"]}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{b.productCount === 0 ? 'Aucun produit' : b.productCount === 1 ? '1 produit' : `${b.productCount} produits`}</span>
                      <span>{b.categoryIds.length === 0 ? 'Aucune sous-catégorie' : b.categoryIds.length === 1 ? '1 sous-catégorie' : `${b.categoryIds.length} sous-catégories`}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleActive(b)} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors">
                    {b.isActive ? map["Brands.disable"] : map["Brands.enable"]}
                  </button>
                  <button onClick={() => openEdit(b)} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors">
                    {map["Common.edit"]}
                  </button>
                  <button onClick={() => { setMergeSource(b); setMergeTargetId(''); }} className="px-2 py-1 text-xs rounded border border-border hover:bg-muted/50 transition-colors">
                    {map["Brands.merge"]}
                  </button>
                  <button onClick={() => setDeletingId(b.id)} className="px-2 py-1 text-xs rounded border border-red-200 text-red-600 hover:bg-red-50 transition-colors">
                    {map["Brands.delete"]}
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
              <h2 className="font-semibold text-foreground">{editing ? map["Brands.editBrand"] : map["Brands.newBrand"]}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{map["Brands.name"]}</label>
                <input type="text" value={fName} onChange={(e) => setFName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{map["Brands.logoUrl"]}</label>
                <input type="text" value={fLogo} onChange={(e) => setFLogo(e.target.value)} placeholder="https://…" className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-foreground mb-1">{map["Brands.sortOrder"]}</label>
                  <input type="number" value={fSort} onChange={(e) => setFSort(Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm" />
                </div>
                <label className="flex items-center gap-2 mt-6 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={fActive} onChange={(e) => setFActive(e.target.checked)} />
                  {map["Brands.active"]}
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">{map["Brands.subcategories"]}</label>
                <p className="text-xs text-muted-foreground mb-2">{map["Brands.subcategoriesHint"]}</p>
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
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50">{map["Brands.cancel"]}</button>
              <button onClick={save} disabled={isSaving} className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-50">{map["Brands.save"]}</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge modal */}
      {mergeSource && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMergeSource(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">{map["Brands.mergeTitle"]}</h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-foreground">{`Fusionner « ${mergeSource.name} » dans une autre marque :`}</p>
              <select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white">
                <option value="">{map["Brands.selectTarget"]}</option>
                {brands.filter((b) => b.id !== mergeSource.id).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">{`Tous les produits de « ${mergeSource.name} » seront réattribués à la marque cible, puis « ${mergeSource.name} » sera supprimée. Cette action est irréversible.`}</p>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setMergeSource(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50">{map["Brands.cancel"]}</button>
              <button onClick={doMerge} disabled={!mergeTargetId || isMerging} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{map["Brands.merge"]}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDeletingId(null)}>
          <div className="bg-white rounded-xl shadow-lg w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <p className="text-sm text-foreground">{map["Brands.confirmDelete"]}</p>
            </div>
            <div className="p-5 pt-0 flex justify-end gap-2">
              <button onClick={() => setDeletingId(null)} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted/50">{map["Brands.cancel"]}</button>
              <button onClick={() => doDelete(deletingId)} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">{map["Brands.delete"]}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
