'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';

export interface CategoryAttribute {
  id: string;
  name: { fr: string; en?: string };
  type: 'TEXT' | 'SELECT' | 'MULTISELECT' | 'NUMERIC';
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

const ATTRIBUTE_TYPES = ['TEXT', 'SELECT', 'MULTISELECT', 'NUMERIC'] as const;

export function AttributeManager({
  categoryId,
  categoryName,
  attributes,
  onRefresh,
}: AttributeManagerProps) {
  const t = useTranslations('Categories');
  const tCommon = useTranslations('Common');

  const [showForm, setShowForm] = useState(false);
  const [editingAttr, setEditingAttr] = useState<CategoryAttribute | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [nameFr, setNameFr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [type, setType] = useState<CategoryAttribute['type']>('TEXT');
  const [options, setOptions] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  const resetForm = () => {
    setNameFr('');
    setNameEn('');
    setType('TEXT');
    setOptions('');
    setIsRequired(false);
    setSortOrder(0);
    setEditingAttr(null);
    setShowForm(false);
  };

  const startEdit = (attr: CategoryAttribute) => {
    setEditingAttr(attr);
    setNameFr(attr.name.fr || '');
    setNameEn(attr.name.en || '');
    setType(attr.type);
    setOptions(attr.options?.join(', ') || '');
    setIsRequired(attr.isRequired);
    setSortOrder(attr.sortOrder);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameFr.trim()) return;

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: { fr: nameFr.trim(), en: nameEn.trim() || undefined },
        type,
        isRequired,
        sortOrder,
      };

      if (type === 'SELECT' || type === 'MULTISELECT') {
        body.options = options
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean);
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
    if (!confirm(t('confirmDeleteAttribute'))) return;

    try {
      await apiFetch(`/v1/admin/categories/${categoryId}/attributes/${attrId}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch {
      // Error handled by apiFetch
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">{t('attributes')}</h3>
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
            + {t('addAttribute')}
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          className="mb-4 p-4 bg-muted/50 rounded-lg border border-border space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t('attributeNameFr')} <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={nameFr}
                onChange={(e) => setNameFr(e.target.value)}
                required
                className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ex: Taille"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t('attributeNameEn')}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ex: Size"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t('attributeType')}
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
                {t('sortOrder')}
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

          {(type === 'SELECT' || type === 'MULTISELECT') && (
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                {t('attributeOptions')}
              </label>
              <input
                type="text"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm border border-input rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Ex: S, M, L, XL"
              />
            </div>
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
              {t('attributeRequired')}
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-sm font-medium text-foreground bg-background border border-border rounded-lg hover:bg-muted transition-colors"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || !nameFr.trim()}
              className="px-3 py-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? tCommon('loading') : tCommon('save')}
            </button>
          </div>
        </form>
      )}

      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6 bg-muted/30 rounded-lg">
          {t('noAttributes')}
        </p>
      ) : (
        <div className="bg-white rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  {t('attributeName')}
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  {t('attributeType')}
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  {t('attributeRequired')}
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">
                  {t('attributeOptions')}
                </th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">
                  {tCommon('actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {attributes.map((attr) => (
                <tr
                  key={attr.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-3 py-2 text-sm text-foreground">{attr.name.fr}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                      {attr.type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-sm text-foreground">
                    {attr.isRequired ? (
                      <span className="text-success font-medium">{tCommon('yes')}</span>
                    ) : (
                      <span className="text-muted-foreground">{tCommon('no')}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
                    {attr.options?.join(', ') || '-'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => startEdit(attr)}
                        className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                        title={t('editAttribute')}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(attr.id)}
                        className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                        title={t('deleteAttribute')}
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
