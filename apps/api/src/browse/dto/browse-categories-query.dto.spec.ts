import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BrowseCategoriesQueryDto } from './browse-categories-query.dto';

describe('BrowseCategoriesQueryDto (SEO-2)', () => {
  const check = (q: Record<string, unknown>) =>
    validateSync(plainToInstance(BrowseCategoriesQueryDto, q));

  it('accepts no cityId (global counts) and a uuid-shaped seeded id', () => {
    expect(check({})).toHaveLength(0);
    expect(check({ cityId: '01000000-0000-0000-0000-000000000001' })).toHaveLength(0);
  });

  it('rejects anything that is not uuid-shaped (no SQL/regex smuggling into the count)', () => {
    expect(check({ cityId: 'lubumbashi' }).length).toBeGreaterThan(0);
    expect(check({ cityId: "1' OR 1=1" }).length).toBeGreaterThan(0);
  });
});
