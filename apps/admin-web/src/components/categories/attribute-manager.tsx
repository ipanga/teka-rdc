'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface CategoryAttribute {
  id: string;
  name: string;
  type: 'TEXT' | 'SELECT' | 'MULTISELECT' | 'NUMERIC' | 'BOOLEAN';
  options?: string[] | null;
  isRequired: boolean;
  sortOrder: number;
}

interface AttributeManagerProps {
  categoryId: string;
  categoryName: string;
  attributes: CategoryAttribute[];
  onRefresh: () => void;
}

const ATTRIBUTE_TYPES = [
  'TEXT',
  'SELECT',
  'MULTISELECT',
  'NUMERIC',
  'BOOLEAN',
] as const;

export function AttributeManager({
  categoryId,
  categoryName,
  attributes,
  onRefresh,
}: AttributeManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingAttr, setEditingAttr] = useState<CategoryAttribute | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isReordering, setIsReordering] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryAttribute['type']>('TEXT');
  const [optionList, setOptionList] = useState<string[]>([]);
  const [optionDraft, setOptionDraft] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const needsOptions = type === 'SELECT' || type === 'MULTISELECT';

  const resetForm = () => {
    setName('');
    setType('TEXT');
    setOptionList([]);
    setOptionDraft('');
    setIsRequired(false);
    setSortOrder(0);
    setEditingAttr(null);
    setShowForm(false);
  };

  const startEdit = (attr: CategoryAttribute) => {
    setEditingAttr(attr);
    setName(attr.name || '');
    setType(attr.type);
    setOptionList(attr.options ?? []);
    setOptionDraft('');
    setIsRequired(attr.isRequired);
    setSortOrder(attr.sortOrder);
    setShowForm(true);
  };

  const addOption = () => {
    const v = optionDraft.trim();
    if (!v || optionList.includes(v)) {
      setOptionDraft('');
      return;
    }
    setOptionList((prev) => [...prev, v]);
    setOptionDraft('');
  };

  const removeOption = (opt: string) => {
    setOptionList((prev) => prev.filter((o) => o !== opt));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        isRequired,
        sortOrder,
      };

      if (needsOptions) {
        body.options = optionList;
      }

      if (editingAttr) {
        await apiFetch(`/v1/admin/categories/${categoryId}/attributes/${editingAttr.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiFetch(`/v1/admin/categories/${categoryId}/attributes`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }

      resetForm();
      onRefresh();
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (attrId: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cet attribut ?")) return;

    try {
      await apiFetch(`/v1/admin/categories/${categoryId}/attributes/${attrId}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch {
      // Error handled by apiFetch
    }
  };

  // Move an attribute up/down and persist the new order via the reorder endpoint.
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= attributes.length || isReordering) return;
    const ids = attributes.map((a) => a.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setIsReordering(true);
    try {
      await apiFetch(`/v1/admin/categories/${categoryId}/attributes/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds: ids }),
      });
      onRefresh();
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsReordering(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Attributs</h3>
          <p className="text-sm text-muted-foreground">{categoryName}</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
          >
            + Ajouter un attribut
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="mb-4 p-4 bg-muted/50 rounded-lg border border-border space-y-3"
        >
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">
              Nom de l&apos;attribut <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex: Taille"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Type
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CategoryAttribute['type'])}
                className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ATTRIBUTE_TYPES.map((attrType) => (
                  <option key={attrType} value={attrType}>
                    {attrType}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Ordre d&apos;affichage
              </label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                min={0}
                className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {needsOptions && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Options
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={optionDraft}
                  onChange={(e) => setOptionDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOption();
                    }
                  }}
                  className="flex-1 px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Saisir une option puis Entrée"
                />
                <button
                  type="button"
                  onClick={addOption}
                  className="px-3 py-1.5 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
                >
                  Ajouter
                </button>
              </div>
              {optionList.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Aucune option ajoutée</p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {optionList.map((opt) => (
                    <span
                      key={opt}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary text-secondary-foreground"
                    >
                      {opt}
                      <button
                        type="button"
                        onClick={() => removeOption(opt)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Options: ${opt}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {type === 'BOOLEAN' && (
            <p className="text-xs text-muted-foreground">Type oui/non — aucune option requise</p>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="attrRequired"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              className="w-4 h-4 rounded border-input text-primary focus:ring-ring"
            />
            <label htmlFor="attrRequired" className="text-xs font-medium text-foreground">
              Obligatoire
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Chargement..." : "Enregistrer"}
            </button>
          </div>
        </form>
      )}

      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 bg-muted/30 rounded-lg">
          Aucun attribut défini pour cette catégorie
        </p>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Nom de l&apos;attribut
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Type
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Obligatoire
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  Options
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((attr, index) => (
                <tr
                  key={attr.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-3 py-2 text-sm text-foreground">{attr.name}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      {attr.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-foreground">
                    {attr.isRequired ? (
                      <span className="text-success font-medium">Oui</span>
                    ) : (
                      <span className="text-muted-foreground">Non</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                    {attr.options?.join(', ') || '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || isReordering}
                        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Monter"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => move(index, 1)}
                        disabled={index === attributes.length - 1 || isReordering}
                        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Descendre"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        onClick={() => startEdit(attr)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                        title="Modifier l'attribut"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(attr.id)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                        title="Supprimer l'attribut"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
