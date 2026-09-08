import { describe, expect, it } from 'vitest';
import { isIndexable, listingRobots } from './indexability';

describe('town × category indexability (SEO-2 decision 1)', () => {
  it('is indexable only with a positive TOWN-scoped eligible count', () => {
    expect(isIndexable({ productCount: 1 })).toBe(true);
    expect(isIndexable({ productCount: 0 })).toBe(false);
    expect(isIndexable({})).toBe(false);
    expect(isIndexable(null)).toBe(false);
    expect(isIndexable(undefined)).toBe(false);
  });

  it('empty → noindex but FOLLOW (links stay crawlable), populated → index, follow', () => {
    expect(listingRobots({ productCount: 0 })).toEqual({ index: false, follow: true });
    expect(listingRobots({ productCount: 5 })).toEqual({ index: true, follow: true });
  });
});
