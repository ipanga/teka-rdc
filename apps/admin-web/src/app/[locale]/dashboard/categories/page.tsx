'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { apiFetch } from '@/lib/api-client';
import { CategoryTree, type Category } from '@/components/categories/category-tree';
import { CategoryFormModal, type CategoryFormData } from '@/components/categories/category-form-modal';
import { AttributeManager, type CategoryAttribute } from '@/components/categories/attribute-manager';

type CategoryDetailData = Category & { attributes: CategoryAttribute[] };

export default function CategoriesPage() {
  const t = useTranslations('Categories');

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  // Selected category + attributes
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [attributes, setAttributes] = useState<CategoryAttribute[]>([]);
  const [isLoadingAttrs, setIsLoadingAttrs] = useState(false);

  // Success/error feedback
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch<Category[] | { data: Category[] }>('/v1/admin/categories');
      const cats = Array.isArray(res.data) ? res.data : (res.data as { data: Category[] }).data || [];
      setCategories(cats);
    } catch {
      // Error handled by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCategoryDetail = useCallback(async (id: string) => {
    setIsLoadingAttrs(true);
    try {
      const res = await apiFetch<CategoryDetailData>(`/v1/admin/categories/${id}`);
      setAttributes(res.data.attributes || []);
    } catch {
      setAttributes([]);
    } finally {
      setIsLoadingAttrs(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (selectedCategory) {
      fetchCategoryDetail(selectedCategory.id);
    }
  }, [selectedCategory, fetchCategoryDetail]);

  // Show feedback and auto-dismiss after 3 seconds
  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleSelect = (category: Category) => {
    setSelectedCategory(category);
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setShowModal(true);
  };

  const handleDelete = async (category: Category) => {
    if (!confirm(t('confirmDelete'))) return;

    try {
      await apiFetch(`/v1/admin/categories/${category.id}`, { method: 'DELETE' });
      showFeedback('success', t('deleted'));
      if (selectedCategory?.id === category.id) {
        setSelectedCategory(null);
        setAttributes([]);
      }
      fetchCategories();
    } catch {
      showFeedback('error', 'Erreur lors de la suppression');
    }
  };

  const handleSave = async (data: CategoryFormData) => {
    if (editingCategory) {
      await apiFetch(`/v1/admin/categories/${editingCategory.id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    } else {
      await apiFetch('/v1/admin/categories', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }
    showFeedback('success', t('saved'));
    fetchCategories();
  };

  const handleNewCategory = () => {
    setEditingCategory(null);
    setShowModal(true);
  };

  // Build flat list of parent options from the category tree
  const buildParentOptions = (cats: Category[], prefix = ''): { id: string; name: string }[] => {
    const result: { id: string; name: string }[] = [];
    for (const cat of cats) {
      result.push({ id: cat.id, name: prefix + cat.name.fr });
      if (cat.children && cat.children.length > 0) {
        result.push(...buildParentOptions(cat.children, prefix + cat.name.fr + ' > '));
      }
    }
    return result;
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
          onClick={handleNewCategory}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors"
        >
          + {t('newCategory')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Category Tree */}
        <div className="bg-white rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('title')}
          </h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">{t('noCategories')}...</p>
            </div>
          ) : (
            <CategoryTree
              categories={categories}
              selectedId={selectedCategory?.id}
              onSelect={handleSelect}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          )}
        </div>

        {/* Right: Attribute Manager */}
        <div className="bg-white rounded-xl border border-border p-4">
          {selectedCategory ? (
            isLoadingAttrs ? (
              <div className="flex items-center justify-center py-8">
                <p className="text-sm text-muted-foreground">...</p>
              </div>
            ) : (
              <AttributeManager
                categoryId={selectedCategory.id}
                categoryName={`${selectedCategory.emoji || ''} ${selectedCategory.name.fr}`}
                attributes={attributes}
                onRefresh={() => fetchCategoryDetail(selectedCategory.id)}
              />
            )
          ) : (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm text-muted-foreground">{t('selectCategory')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Category Form Modal */}
      <CategoryFormModal
        isOpen={showModal}
        category={editingCategory}
        parentOptions={buildParentOptions(categories)}
        onClose={() => {
          setShowModal(false);
          setEditingCategory(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
