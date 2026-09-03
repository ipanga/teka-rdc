import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * buyer-web builds its search querystring in TWO places, and they do not agree:
 *
 *  - `buildQuery()`      backs "Appliquer", "Effacer", sort and load-more;
 *  - an inline builder   inside the `[query]` effect backs the actual submitted
 *                        search, and is the only path that fires search_performed.
 *
 * A search-analytics tag added to only one of them would either miss every
 * first-load search or count every filter click as new demand. This guards the
 * split, because nothing else in the file makes it obvious.
 *
 * It is a source-level assertion on purpose: rendering the page would need a
 * router, a city store and a mocked apiFetch to prove a one-line querystring
 * fact, and would break for reasons unrelated to what is being asserted.
 */
const source = readFileSync(
  join(__dirname, 'search-page.tsx'),
  'utf8',
);

describe('buyer-web search analytics tagging', () => {
  it('tags every browse request as coming from BUYER_WEB', () => {
    const tags = source.match(/qs\.set\('searchSource', 'BUYER_WEB'\)/g) ?? [];
    // Once per builder — the refinement builder and the submitted-search builder.
    expect(tags).toHaveLength(2);
  });

  it('tags the submitted search as SUBMIT', () => {
    expect(source).toContain("qs.set('searchIntent', 'SUBMIT')");
  });

  // The duplicate-counting fix: applying a filter, clearing filters, changing
  // the sort or loading more is the SAME search, re-run.
  it('tags the filter / sort / load-more builder as REFINE', () => {
    expect(source).toContain("qs.set('searchIntent', 'REFINE')");
  });

  it('has exactly one SUBMIT and one REFINE — never two of either', () => {
    const submit = source.match(/'searchIntent', 'SUBMIT'/g) ?? [];
    const refine = source.match(/'searchIntent', 'REFINE'/g) ?? [];
    expect(submit).toHaveLength(1);
    expect(refine).toHaveLength(1);
  });

  it('still sends the unchanged search contract', () => {
    expect(source).toContain("qs.set('search', query)");
    expect(source).toContain("qs.set('limit', '12')");
    expect(source).toContain("qs.set('sortBy', 'popularity')");
  });

  // Guard against silently "fixing" a known divergence while touching this
  // file: the submitted-search builder has always been nationwide, and adding
  // cityId there would change the results buyers see.
  it('leaves the submitted-search builder city-unscoped', () => {
    const effectStart = source.indexOf("qs.set('searchIntent', 'SUBMIT')");
    const effectEnd = source.indexOf('apiFetch', effectStart);
    expect(effectStart).toBeGreaterThan(-1);
    expect(source.slice(effectStart, effectEnd)).not.toContain("qs.set('cityId'");
  });
});
