import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCategoryDto } from './create-category.dto';

const errorsFor = async (searchKeywords: unknown) =>
  validate(plainToInstance(CreateCategoryDto, { name: 'Lessive', searchKeywords }));

describe('CreateCategoryDto.searchKeywords', () => {
  it('accepts a normal list and an empty list', async () => {
    expect(await errorsFor(['omo', 'savon poudre'])).toHaveLength(0);
    expect(await errorsFor([])).toHaveLength(0);
  });

  it('refuses a non-list, a one-letter or over-long term, and more than 40 terms', async () => {
    expect(await errorsFor('omo')).not.toHaveLength(0);
    expect(await errorsFor(['o'])).not.toHaveLength(0);
    expect(await errorsFor(['x'.repeat(61)])).not.toHaveLength(0);
    expect(await errorsFor(Array.from({ length: 41 }, (_, i) => `terme ${i}`))).not.toHaveLength(0);
  });
});
