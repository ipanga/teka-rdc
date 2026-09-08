/**
 * Plain-text projection of seller-written markdown for the places search
 * engines read verbatim: meta descriptions, Open Graph descriptions and the
 * JSON-LD `description`. Product and CMS bodies are markdown (headings,
 * bold, links, lists); a raw `## Titre\n**gras**` inside a `<meta>` reads as
 * noise in a snippet and is not "text" in the schema.org sense.
 *
 * Strips: ATX headings, bold/italic markers, link syntax (keeps the label),
 * inline code, list bullets, blockquote markers; collapses whitespace.
 * Deliberately conservative — anything it does not recognise is kept.
 */
export function plainText(markdown: string | null | undefined): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate to `max` characters on a word boundary with an ellipsis, for meta
 * descriptions (Google displays ~155–160). Input should already be plain text.
 */
export function truncateForMeta(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).replace(/[\s.,;:]+$/, '')}…`;
}
