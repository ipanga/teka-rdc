import { randomInt } from 'crypto';

/**
 * Slugify arbitrary French text into a clean, URL-friendly token.
 * Strips accents, lowercases, turns "&" into "et", collapses everything
 * non-alphanumeric into single hyphens.
 *
 * Examples:
 *   "Téléphones & Électronique" -> "telephones-et-electronique"
 *   "iPhone 15 Pro Max"         -> "iphone-15-pro-max"
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents (é→e, à→a)
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumerics → single hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .substring(0, 80); // cap the readable portion
}

/**
 * Generate a CLEAN, city-independent product slug from a French title.
 *
 * Since 2026-06-06 (city-first URL refactor) the slug is purely cosmetic /
 * SEO-readable and is NOT unique on its own — the canonical product URL is
 * `/{ville}/{slug}-{shortCode}` and products are resolved by `shortCode`.
 * The city name must NOT be baked into the slug (it lives in the path), nor a
 * UUID suffix (that's what `shortCode` is for).
 *
 * Examples:
 *   "Samsung Galaxy A56"  -> "samsung-galaxy-a56"
 *   "Chaussures de sport" -> "chaussures-de-sport"
 */
export function generateProductSlug(frenchTitle: string): string {
  return slugify(frenchTitle);
}

const SHORT_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'; // base36, lowercase
const SHORT_CODE_LENGTH = 6; // 36^6 ≈ 2.2 billion combos

/**
 * Generate a short, URL-friendly, collision-resistant product code that forms
 * the resolvable tail of a product URL: `/{ville}/{slug}-{shortCode}`.
 * 6 base36 chars (~2.2B space). Uniqueness is enforced by the `@unique`
 * column; callers retry generation on the rare collision.
 */
export function generateShortCode(): string {
  let code = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)];
  }
  return code;
}

/** True when a URL token looks like a product shortCode (6 lowercase base36). */
export function isShortCode(token: string): boolean {
  return new RegExp(`^[a-z0-9]{${SHORT_CODE_LENGTH}}$`).test(token);
}
