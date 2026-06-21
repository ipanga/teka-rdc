import Image from 'next/image';
import { categoryImage } from '@/lib/category-images';

/**
 * Round category icon — a bundled product photo when the category has one,
 * otherwise the category emoji. Used by the homepage, the city landing page,
 * and the all-categories grid so the treatment stays consistent.
 */
export function CategoryIcon({
  slug,
  emoji,
  size = 'md',
}: {
  slug?: string | null;
  emoji?: string | null;
  size?: 'md' | 'lg';
}) {
  const img = categoryImage(slug);
  // Outer circle box; the photo sits inside with padding (object-contain) so the
  // transparent product cut-out never gets clipped by the circle.
  const box = size === 'lg' ? 'w-20 h-20' : 'w-16 h-16';
  const px = size === 'lg' ? 80 : 64;

  return (
    <span
      className={`flex items-center justify-center ${box} rounded-full bg-surface-muted border border-border overflow-hidden transition-transform duration-200 group-hover:scale-105`}
    >
      {img ? (
        <Image
          src={img}
          alt=""
          width={px}
          height={px}
          className="h-[78%] w-[78%] object-contain"
        />
      ) : (
        <span className={size === 'lg' ? 'text-3xl' : 'text-2xl'} aria-hidden>
          {emoji || '📦'}
        </span>
      )}
    </span>
  );
}
