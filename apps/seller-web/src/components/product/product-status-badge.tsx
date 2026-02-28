'use client';

import { useTranslations } from 'next-intl';

type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'REJECTED' | 'ARCHIVED';

const statusStyles: Record<ProductStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING_REVIEW: 'bg-warning/15 text-warning',
  ACTIVE: 'bg-success/15 text-success',
  REJECTED: 'bg-destructive/15 text-destructive',
  ARCHIVED: 'bg-muted text-muted-foreground/70',
};

export function ProductStatusBadge({ status }: { status: string }) {
  const t = useTranslations('Products');

  const labelMap: Record<ProductStatus, string> = {
    DRAFT: t('statusDraft'),
    PENDING_REVIEW: t('statusPending'),
    ACTIVE: t('statusActive'),
    REJECTED: t('statusRejected'),
    ARCHIVED: t('statusArchived'),
  };

  const s = status as ProductStatus;
  const style = statusStyles[s] || statusStyles.DRAFT;
  const label = labelMap[s] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {label}
    </span>
  );
}
