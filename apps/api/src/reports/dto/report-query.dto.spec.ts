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
