'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export interface Category {
  id: string;
  name: { fr: string; en?: string };
  description?: { fr?: string; en?: string } | null;
  emoji?: string | null;
  sortOrder: number;
  isActive: boolean;
  parentCategoryId?: string | null;
  _count?: { products: number };
  children?: Category[];
}

interface CategoryTreeProps {
  categories: Category[];
  selectedId?: string | null;
  onSelect: (category: Category) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

export function CategoryTree({
  categories,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
}: CategoryTreeProps) {
  const t = useTranslations('Categories');

  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        {t('noCategories')}
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {categories.map((category) => (
        <CategoryNode
          key={category.id}
          category={category}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          t={t}
        />
      ))}
    </div>
  );
}

interface CategoryNodeProps {
  category: Category;
  depth: number;
  selectedId?: string | null;
  onSelect: (category: Category) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  t: ReturnType<typeof useTranslations<'Categories'>>;
}

function CategoryNode({
  category,
  depth,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  t,
}: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;
  const isSelected = selectedId === category.id;
  const productCount = category._count?.products ?? 0;

  return (
    <div>
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
          isSelected
            ? 'bg-primary/10 border border-primary/20'
            : 'hover:bg-muted border border-transparent'
        }`}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => onSelect(category)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title={expanded ? t('collapse') : t('expand')}
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <span className="text-base shrink-0">{category.emoji || '\u{1F4C1}'}</span>

        <span className={`text-sm font-medium flex-1 min-w-0 truncate ${
          !category.isActive ? 'text-muted-foreground line-through' : 'text-foreground'
        }`}>
          {category.name.fr}
        </span>

        {productCount > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
            {productCount}
          </span>
        )}

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title={t('editCategory')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(category);
            }}
            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
            title={t('deleteCategory')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {category.children!.map((child) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              t={t}
            />
          ))}
        </div>
      )}
    </div>
  );
}
