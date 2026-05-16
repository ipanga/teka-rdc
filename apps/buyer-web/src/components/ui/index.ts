/**
 * Teka design-system primitives.
 *
 * Built on top of the Tailwind v4 `@theme inline {}` tokens in
 * `src/app/globals.css`. All variants use `class-variance-authority` for
 * ergonomic composition. Keep this surface small — primitives only, no
 * domain logic. Domain components (ProductCard, CartItemRow, etc.) live
 * under `src/components/{product,cart,...}/` and consume these.
 */

export { Button, buttonVariants, type ButtonProps } from './button';
export { Badge, badgeVariants, type BadgeProps } from './badge';
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
  type CardProps,
} from './card';
export { Input, type InputProps } from './input';
export { Label } from './label';
export { Container } from './container';
export { SectionHeader } from './section-header';
export { cn } from './utils';
