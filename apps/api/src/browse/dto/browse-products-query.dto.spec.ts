import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { BrowseProductsQueryDto } from './browse-products-query.dto';

/**
 * Contract guard for the buyer search query string.
 *
 * `main.ts` runs the pipe with `forbidNonWhitelisted: true`, so an undeclared
 * parameter is a hard 400 rather than a silent drop — which is exactly why the
 * API accepting `searchSource` / `searchIntent` must be deployed BEFORE any
 * client starts sending them. These tests pin both halves of that contract.
 *
 * The pipe is configured identically to main.ts.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const meta: ArgumentMetadata = {
  type: 'query',
  metatype: BrowseProductsQueryDto,
};

const run = (v: Record<string, unknown>) => pipe.transform(v, meta);

describe('BrowseProductsQueryDto — search analytics params', () => {
  it('accepts a plain search with no analytics params (deployed clients)', async () => {
    const out = await run({ search: 'robe' });
    expect(out.search).toBe('robe');
    expect(out.searchSource).toBeUndefined();
    expect(out.searchIntent).toBeUndefined();
  });

  it('accepts the values both buyer clients send', async () => {
    for (const source of ['BUYER_WEB', 'BUYER_MOBILE']) {
      for (const intent of ['SUBMIT', 'SUGGESTION', 'REFINE']) {
        const out = await run({ search: 'robe', searchSource: source, searchIntent: intent });
        expect(out.searchSource).toBe(source);
        expect(out.searchIntent).toBe(intent);
      }
    }
  });

  // The decision this pins: analytics values are validated in the SERVICE, not
  // by @IsEnum here. A strict enum would turn a client typo into a 400 on the
  // search endpoint — telemetry breaking the buyer's search, which is exactly
  // what the design forbids. Unknown values become UNKNOWN / are not recorded.
  it('does NOT reject an unrecognised analytics value', async () => {
    await expect(
      run({ search: 'robe', searchSource: 'NONSENSE', searchIntent: 'NONSENSE' }),
    ).resolves.toBeDefined();
  });

  it('bounds the analytics values so they cannot be used as a payload', async () => {
    await expect(run({ search: 'robe', searchSource: 'x'.repeat(33) })).rejects.toThrow(
      BadRequestException,
    );
    await expect(run({ search: 'robe', searchIntent: 'x'.repeat(33) })).rejects.toThrow(
      BadRequestException,
    );
  });

  // Deployment-order guard. If this ever passes, the API has stopped rejecting
  // undeclared params and the "API first" constraint no longer applies.
  it('rejects an undeclared parameter (forbidNonWhitelisted)', async () => {
    await expect(run({ search: 'robe', searchOrigin: 'BUYER_WEB' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('leaves the existing search contract untouched', async () => {
    const out = await run({
      search: 'robe',
      cityId: '01000000-0000-0000-0000-000000000001',
      sortBy: 'popularity',
      limit: 12,
    });
    expect(out).toMatchObject({ sortBy: 'popularity', limit: 12 });
  });
});
