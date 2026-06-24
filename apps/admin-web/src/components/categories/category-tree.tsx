'use client';

import { useState } from 'react';

export interface Category {
  id: string;
  name: string;
  description?: string | null;
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
  /** Persist a new sibling order (the full ordered id list of one parent). */
  onReorder?: (orderedIds: string[]) => void;
}

export function CategoryTree({
  categories,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onReorder,
}: CategoryTreeProps) {
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Aucune catégorie trouvée
      </p>
    );
  }

  return (
    <div className="space-y-0.5">
      {categories.map((category, index) => (
        <CategoryNode
          key={category.id}
          category={category}
          depth={0}
          siblings={categories}
          index={index}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ))}
    </div>
  );
}

interface CategoryNodeProps {
  category: Category;
  depth: number;
  siblings: Category[];
  index: number;
  selectedId?: string | null;
  onSelect: (category: Category) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onReorder?: (orderedIds: string[]) => void;
}

function CategoryNode({
  category,
  depth,
  siblings,
  index,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onReorder,
}: CategoryNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;
  const isSelected = selectedId === category.id;
  const productCount = category._count?.products ?? 0;

  // Reorder this node within its sibling group: build the full ordered id list
  // with this node moved one slot up/down, then persist it.
  const move = (direction: -1 | 1) => {
    const target = index + direction;
    if (!onReorder || target < 0 || target >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    onReorder(ids);
  };

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
            title={expanded ? "Réduire" : "Développer"}
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
          {category.name}
        </span>

        {productCount > 0 && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full shrink-0">
            {productCount}
          </span>
        )}

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          {onReorder && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); move(-1); }}
                disabled={index === 0}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Monter"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); move(1); }}
                disabled={index === siblings.length - 1}
                className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Descendre"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(category);
            }}
            className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
            title="Modifier la catégorie"
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
            title="Supprimer la catégorie"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {category.children!.map((child, childIndex) => (
            <CategoryNode
              key={child.id}
              category={child}
              depth={depth + 1}
              siblings={category.children!}
              index={childIndex}
              selectedId={selectedId}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onReorder={onReorder}
            />
          ))}
        </div>
      )}
    </div>
  );
}
