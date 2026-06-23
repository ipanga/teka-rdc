'use client';

type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';

const statusStyles: Record<ProductStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING_REVIEW: 'bg-warning/15 text-warning',
  ACTIVE: 'bg-success/15 text-success',
  REJECTED: 'bg-destructive/15 text-destructive',
  ARCHIVED: 'bg-muted text-muted-foreground/70',
};

const labelMap: Record<ProductStatus, string> = {
  DRAFT: 'Brouillon',
  PENDING_REVIEW: 'En attente',
  ACTIVE: 'Actif',
  REJECTED: 'Rejeté',
  ARCHIVED: 'Archivé',
};

export function ProductStatusBadge({ status }: { status: string }) {
  const s = status as ProductStatus;
  const style = statusStyles[s] || statusStyles.DRAFT;
  const label = labelMap[s] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
