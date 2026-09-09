/**
 * Serialise structured data for an inline `<script type="application/ld+json">`.
 *
 * `JSON.stringify` alone is NOT safe inside a script element: the HTML parser
 * ends the script at the first literal `</script` (and `<!--` opens a comment)
 * regardless of JSON context, so seller-controlled text (product title,
 * description, brand, shop name) could break out and execute. Escaping `<`,
 * `>`, `&` and the two Unicode line terminators as `\uXXXX` keeps the payload
 * valid JSON — search engines parse it identically — while making a breakout
 * impossible. Every JSON-LD block on the site goes through this function.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
