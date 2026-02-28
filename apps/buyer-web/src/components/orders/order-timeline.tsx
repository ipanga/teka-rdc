'use client';

import { useTranslations, useLocale } from 'next-intl';
import type { OrderStatusLog } from '@/lib/types';
import { OrderStatusBadge } from './order-status-badge';

interface OrderTimelineProps {
  logs: OrderStatusLog[];
}

function formatDate(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-CD' : 'fr-CD', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function OrderTimeline({ logs }: OrderTimelineProps) {
  const t = useTranslations('Orders');
  const locale = useLocale();

  if (!logs || logs.length === 0) return null;

  // Sort logs chronologically (oldest first)
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-4">{t('timeline')}</h3>
      <div className="relative">
        {sortedLogs.map((log, index) => {
          const isLast = index === sortedLogs.length - 1;

          return (
            <div key={log.id} className="flex gap-3 pb-6 last:pb-0">
              {/* Timeline dot and line */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-3 h-3 rounded-full shrink-0 mt-0.5 ${
                    isLast ? 'bg-primary ring-4 ring-primary/20' : 'bg-muted-foreground/40'
                  }`}
                />
                {!isLast && (
                  <div className="w-0.5 flex-1 bg-border mt-1" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 -mt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <OrderStatusBadge status={log.status} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(log.createdAt, locale)}
                  </span>
                </div>
                {log.note && (
                  <p className="text-xs text-muted-foreground mt-1">{log.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
