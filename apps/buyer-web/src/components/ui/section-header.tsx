import Link from 'next/link';
import { cn } from './utils';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  className?: string;
}

/**
 * Section header used between homepage rows (categories, popular,
 * newest, etc.). Mirrors Rakuten France's section pattern: bold title
 * left, optional "Voir tout →" link right.
 */
export function SectionHeader({
  title,
  subtitle,
  viewAllHref,
  viewAllLabel = 'Voir tout',
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mb-4 md:mb-6', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2.5 text-xl md:text-2xl font-bold text-foreground">
          <span aria-hidden className="h-5 w-1 shrink-0 rounded-full bg-primary" />
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        )}
      </div>
      {viewAllHref && (
        <Link
          href={viewAllHref}
          className="text-sm font-medium text-primary hover:text-primary-hover hover:underline underline-offset-4 whitespace-nowrap"
        >
          {viewAllLabel} <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  );
}
