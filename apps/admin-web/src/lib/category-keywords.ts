/**
 * « Mots-clés de recherche / Synonymes » on the admin category editor.
 *
 * The admin types one alias per line or separated by commas; the API receives
 * a list. Duplicates that differ only by case, accents or spacing are merged
 * here too (the API cleans again — this only keeps the preview honest).
 */
export const MAX_CATEGORY_KEYWORDS = 40;

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function parseKeywordInput(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\n,;]/)) {
    const display = raw.trim().replace(/\s+/g, ' ');
    const key = fold(display);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(display);
  }
  return out;
}

export function formatKeywordInput(keywords: string[] | null | undefined): string {
  return (keywords ?? []).join('\n');
}

/** French reason the list cannot be saved, or null. Mirrors the API bounds. */
export function keywordInputError(keywords: string[]): string | null {
  if (keywords.length > MAX_CATEGORY_KEYWORDS) {
    return `Au plus ${MAX_CATEGORY_KEYWORDS} mots-clés par catégorie.`;
  }
  const bad = keywords.find((k) => k.length < 2 || k.length > 60);
  return bad ? `« ${bad} » : chaque mot-clé doit contenir entre 2 et 60 caractères.` : null;
}
