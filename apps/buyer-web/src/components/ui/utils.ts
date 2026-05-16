/**
 * Tiny class merger — concatenates truthy class strings.
 * Avoids pulling in `clsx`/`tailwind-merge` for ~50 LOC of dedup logic
 * (Tailwind v4's later-wins rule + our discipline of not stacking
 * conflicting utilities keeps this simple).
 */
export function cn(...inputs: Array<string | undefined | null | false>): string {
  return inputs.filter(Boolean).join(' ');
}
