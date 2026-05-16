import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from './utils';

/**
 * Centered max-width wrapper used by page-level layouts.
 * Width matches Rakuten France's main content column at the lg breakpoint.
 */
export const Container = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', className)}
      {...props}
    />
  ),
);
Container.displayName = 'Container';
