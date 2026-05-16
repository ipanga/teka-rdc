import { forwardRef, type HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full text-xs font-semibold leading-none',
  {
    variants: {
      variant: {
        default: 'bg-muted text-foreground',
        success: 'bg-success-subtle text-success',
        warning: 'bg-warning-subtle text-warning',
        danger: 'bg-destructive-subtle text-destructive',
        info: 'bg-info-subtle text-info',
        // Solid red discount tag — Rakuten "-X%" style
        discount: 'bg-primary text-primary-foreground tracking-tight',
        // Neuf / Occasion product-condition pills
        new: 'bg-success-subtle text-success',
        used: 'bg-warning-subtle text-warning',
        // Solid foreground pill — used on dark imagery overlays
        solid: 'bg-foreground text-background',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-1 text-xs',
        lg: 'px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Badge.displayName = 'Badge';

export { badgeVariants };
