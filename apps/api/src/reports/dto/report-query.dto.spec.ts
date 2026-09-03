import {
  ArgumentMetadata,
  BadRequestException,
  ValidationPipe,
} from '@nestjs/common';
import { ReportQueryDto } from './report-query.dto';

/**
 * Contract guard for the admin report query string.
 *
 * These cases cannot live in an e2e spec: Nest runs GUARDS BEFORE PIPES, so a
 * request to an `@Roles('ADMIN')` route with a malformed query and no session
 * is rejected with 401 and never reaches validation. The pipe is therefore
 * exercised directly here, configured exactly as in main.ts.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const meta: ArgumentMetadata = { type: 'query', metatype: ReportQueryDto };

async function validate(value: Record<string, unknown>) {
  return pipe.transform(value, meta);
}

async function messagesFor(value: Record<string, unknown>): Promise<string> {
  try {
    await validate(value);
    throw new Error('expected validation to fail');
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    return JSON.stringify(e.getResponse());
  }
}

describe('ReportQueryDto', () => {
  it('accepts an empty query and applies the defaults', async () => {
    const out = await validate({});
    expect(out.page).toBe(1);
    expect(out.limit).toBe(50);
  });

  it('accepts the YYYY-MM-DD values admin-web\'s date inputs emit', async () => {
    const out = await validate({
      dateFrom: '2026-06-01',
      dateTo: '2026-06-30',
    });
    expect(out.dateFrom).toBe('2026-06-01');
  });

  it('coerces numeric strings from the query string', async () => {
    const out = await validate({ page: '2', limit: '25' });
    expect(out.page).toBe(2);
    expect(out.limit).toBe(25);
  });

  describe('date range', () => {
    it('rejects an inverted range with a French message', async () => {
      const msg = await messagesFor({
        dateFrom: '2026-06-30',
        dateTo: '2026-06-01',
      });
      expect(msg).toContain('La date de début doit précéder la date de fin.');
    });

    it('rejects a range wider than a year', async () => {
      const msg = await messagesFor({
        dateFrom: '2025-01-01',
        dateTo: '2026-12-31',
      });
      expect(msg).toContain('ne peut pas dépasser 366 jours');
    });

    it('accepts a range of exactly the maximum span', async () => {
      // 2028 is a leap year: 1 Jan → 31 Dec inclusive is 366 days.
      await expect(
        validate({ dateFrom: '2028-01-01', dateTo: '2028-12-31' }),
      ).resolves.toBeDefined();
    });

    it('accepts a single bound without the other', async () => {
      await expect(validate({ dateFrom: '2026-06-01' })).resolves.toBeDefined();
      await expect(validate({ dateTo: '2026-06-01' })).resolves.toBeDefined();
    });

    it('rejects a non-date value', async () => {
      const msg = await messagesFor({ dateFrom: 'pas-une-date' });
      expect(msg).toContain('La date de début doit être au format ISO');
    });
  });

  describe('bounds', () => {
    it('rejects a limit above the ceiling', async () => {
      const msg = await messagesFor({ limit: 500 });
      expect(msg).toContain('La limite ne peut pas dépasser 200');
    });

    it('rejects page 0 and negative pages', async () => {
      expect(await messagesFor({ page: 0 })).toContain(
        'La page doit être au minimum 1',
      );
      expect(await messagesFor({ page: -3 })).toContain(
        'La page doit être au minimum 1',
      );
    });

    it('rejects an invalid sellerId', async () => {
      const msg = await messagesFor({ sellerId: 'not-a-uuid' });
      expect(msg).toContain('ID vendeur invalide');
    });
  });

  // Documents the deploy-ordering constraint: because forbidNonWhitelisted is
  // on, a client sending a parameter the API does not yet declare gets a hard
  // 400. Any new filter must ship in the API before any client sends it.
  it('rejects an undeclared parameter rather than dropping it', async () => {
    await expect(validate({ cityId: 'x' })).rejects.toThrow(BadRequestException);
  });
});

// ─── Sales breakdown dimension ───────────────────────────────────────────

import { SalesBreakdownQueryDto } from './sales-breakdown-query.dto';

const breakdownMeta: ArgumentMetadata = {
  type: 'query',
  metatype: SalesBreakdownQueryDto,
};

describe('SalesBreakdownQueryDto', () => {
  it('defaults to the day dimension', async () => {
    const out = await pipe.transform({}, breakdownMeta);
    expect(out.by).toBe('day');
  });

  it.each(['product', 'category', 'seller', 'town', 'day'])(
    'accepts the %s dimension',
    async (by) => {
      const out = await pipe.transform({ by }, breakdownMeta);
      expect(out.by).toBe(by);
    },
  );

  it('rejects an unknown dimension with a French message', async () => {
    try {
      await pipe.transform({ by: 'galaxy' }, breakdownMeta);
      throw new Error('expected validation to fail');
    } catch (e) {
      if (!(e instanceof BadRequestException)) throw e;
      expect(JSON.stringify(e.getResponse())).toContain('Dimension invalide');
    }
  });

  it('still inherits the date-range and pagination rules', async () => {
    try {
      await pipe.transform(
        { by: 'product', dateFrom: '2026-06-30', dateTo: '2026-06-01' },
        breakdownMeta,
      );
      throw new Error('expected validation to fail');
    } catch (e) {
      if (!(e instanceof BadRequestException)) throw e;
      expect(JSON.stringify(e.getResponse())).toContain(
        'La date de début doit précéder la date de fin.',
      );
    }
  });
});

// ─── Search analytics filters ────────────────────────────────────────────

import {
  SearchAnalyticsQueryDto,
  SearchBreakdownQueryDto,
} from './search-analytics-query.dto';

const searchMeta: ArgumentMetadata = {
  type: 'query',
  metatype: SearchAnalyticsQueryDto,
};
const searchBreakdownMeta: ArgumentMetadata = {
  type: 'query',
  metatype: SearchBreakdownQueryDto,
};

async function rejects(value: Record<string, unknown>, meta: ArgumentMetadata) {
  try {
    await pipe.transform(value, meta);
    throw new Error('expected validation to fail');
  } catch (e) {
    if (!(e instanceof BadRequestException)) throw e;
    return JSON.stringify(e.getResponse());
  }
}

describe('SearchAnalyticsQueryDto', () => {
  it('accepts an empty query with the inherited defaults', async () => {
    const out = await pipe.transform({}, searchMeta);
    expect(out.page).toBe(1);
    expect(out.limit).toBe(50);
  });

  it('accepts every real source, UNKNOWN included', async () => {
    for (const source of ['BUYER_WEB', 'BUYER_MOBILE', 'UNKNOWN']) {
      const out = await pipe.transform({ source }, searchMeta);
      expect(out.source).toBe(source);
    }
  });

  it('accepts both stored intents', async () => {
    for (const intent of ['SUBMIT', 'SUGGESTION']) {
      const out = await pipe.transform({ intent }, searchMeta);
      expect(out.intent).toBe(intent);
    }
  });

  // REFINE is never persisted, so filtering by it could only ever return zero
  // rows. Rejecting it is clearer than silently returning nothing.
  it('rejects REFINE, which the write path never stores', async () => {
    expect(await rejects({ intent: 'REFINE' }, searchMeta)).toContain(
      'Intention invalide',
    );
  });

  it('rejects an unknown source with a French message', async () => {
    expect(await rejects({ source: 'WEB' }, searchMeta)).toContain('Source invalide');
  });

  it('rejects a malformed town id', async () => {
    expect(await rejects({ cityId: 'nope' }, searchMeta)).toContain('ID ville invalide');
  });

  it('rejects a non-boolean zeroResultsOnly', async () => {
    expect(await rejects({ zeroResultsOnly: 'maybe' }, searchMeta)).toContain(
      'zeroResultsOnly',
    );
  });

  it('still inherits the date-range and pagination bounds', async () => {
    expect(
      await rejects({ dateFrom: '2026-06-30', dateTo: '2026-06-01' }, searchMeta),
    ).toContain('La date de début doit précéder la date de fin.');
    expect(await rejects({ limit: 500 }, searchMeta)).toContain(
      'La limite ne peut pas dépasser 200',
    );
  });

  it('rejects an undeclared filter (forbidNonWhitelisted)', async () => {
    await expect(pipe.transform({ nope: '1' }, searchMeta)).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('SearchBreakdownQueryDto', () => {
  it('defaults to the day dimension', async () => {
    const out = await pipe.transform({}, searchBreakdownMeta);
    expect(out.by).toBe('day');
  });

  it.each(['source', 'intent', 'town', 'day'])('accepts by=%s', async (by) => {
    const out = await pipe.transform({ by }, searchBreakdownMeta);
    expect(out.by).toBe(by);
  });

  it('rejects an unknown dimension', async () => {
    expect(await rejects({ by: 'galaxy' }, searchBreakdownMeta)).toContain(
      'Dimension invalide',
    );
  });
});
