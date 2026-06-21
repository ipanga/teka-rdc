/**
 * Top-category illustration images (bundled static assets in `public/categories/`).
 * Keyed by the category slug. The 7 top-level categories are a fixed taxonomy,
 * so bundling beats a network/Cloudinary fetch (faster, works offline on
 * mobile, no per-icon round-trip on DRC 2G/3G). Subcategories — and any future
 * top category without an asset yet — fall back to the emoji.
 *
 * To add a category image: drop `public/categories/<slug>.png` and add one line.
 */
const CATEGORY_IMAGES: Record<string, string> = {
  supermarche: '/categories/supermarche.png',
  'telephones-et-accessoires': '/categories/telephones-et-accessoires.png',
  electromenager: '/categories/electromenager.png',
  mode: '/categories/mode.png',
  'beaute-et-sante': '/categories/beaute-et-sante.png',
  'construction-et-bricolage': '/categories/construction-et-bricolage.png',
  'automobile-et-moto': '/categories/automobile-et-moto.png',
};

export function categoryImage(slug?: string | null): string | null {
  if (!slug) return null;
  return CATEGORY_IMAGES[slug] ?? null;
}
