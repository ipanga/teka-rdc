import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SearchSynonymsService } from './search-synonyms.service';
import { CreateSearchSynonymDto, UpdateSearchSynonymDto } from './dto/search-synonym.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Reflector } from '@nestjs/core';
import { SearchSynonymsController } from './search-synonyms.controller';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

function makeService(rows: Record<string, unknown>[] = []) {
  const store = [...rows];
  const prisma = {
    searchSynonym: {
      findMany: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
        let out = store;
        if (where?.isActive !== undefined) out = out.filter((r) => r.isActive === where.isActive);
        const not = (where?.id as { not?: string } | undefined)?.not;
        if (not) out = out.filter((r) => r.id !== not);
        return out;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        store.find((r) => r.id === where.id) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'new', ...data })),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
        ...store.find((r) => r.id === where.id),
        ...data,
      })),
      delete: jest.fn(async () => ({})),
    },
  };
  return { service: new SearchSynonymsService(prisma as never), prisma };
}

const GSM = {
  id: 'g1',
  terms: ['gsm', 'portable', 'téléphone'],
  isActive: true,
  note: 'argot congolais',
};

describe('SearchSynonymsService', () => {
  it('lists newest first with active/total counts', async () => {
    const { service } = makeService([GSM, { ...GSM, id: 'g2', isActive: false }]);
    const { groups, meta } = await service.findAll();
    expect(groups).toHaveLength(2);
    expect(meta).toEqual({ total: 2, active: 1 });
  });

  it('404s on an unknown group', async () => {
    const { service } = makeService();
    await expect(service.findOne('nope')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates an active group by default', async () => {
    const { service, prisma } = makeService();
    await service.create({ terms: ['frigo', 'réfrigérateur'] } as CreateSearchSynonymDto);
    expect(prisma.searchSynonym.create).toHaveBeenCalledWith({
      data: { terms: ['frigo', 'réfrigérateur'], note: null, isActive: true },
    });
  });

  // Two active groups sharing a term make expansion order-dependent and merge
  // them by accident, so the overlap is refused and the term is named.
  it('REFUSES a new active group overlapping an existing active one', async () => {
    const { service, prisma } = makeService([GSM]);
    await expect(
      service.create({ terms: ['Portable', 'mobile'] } as CreateSearchSynonymDto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.searchSynonym.create).not.toHaveBeenCalled();
  });

  it('matches overlap accent- and case-insensitively, like the browse side', async () => {
    const { service } = makeService([GSM]);
    await expect(
      service.create({ terms: ['TELEPHONE', 'cellulaire'] } as CreateSearchSynonymDto),
    ).rejects.toThrow(/appartient déjà/);
  });

  it('allows an overlap with an INACTIVE group — it expands nothing', async () => {
    const { service, prisma } = makeService([{ ...GSM, isActive: false }]);
    await service.create({ terms: ['portable', 'mobile'] } as CreateSearchSynonymDto);
    expect(prisma.searchSynonym.create).toHaveBeenCalled();
  });

  it('does not treat a group as overlapping itself on update', async () => {
    const { service, prisma } = makeService([GSM]);
    await service.update('g1', { terms: ['gsm', 'portable', 'mobile'] } as UpdateSearchSynonymDto);
    expect(prisma.searchSynonym.update).toHaveBeenCalled();
  });

  it('keeps the existing note when update omits it', async () => {
    const { service, prisma } = makeService([GSM]);
    await service.update('g1', { isActive: false } as UpdateSearchSynonymDto);
    const data = (prisma.searchSynonym.update as jest.Mock).mock.calls[0][0].data;
    expect(data).not.toHaveProperty('note');
    expect(data.isActive).toBe(false);
  });

  it('deactivate is the reversible off switch and is idempotent', async () => {
    const { service, prisma } = makeService([{ ...GSM, isActive: false }]);
    await service.setActive('g1', false);
    expect(prisma.searchSynonym.update).not.toHaveBeenCalled();
  });

  it('re-activating is refused when it would overlap a live group', async () => {
    const { service } = makeService([
      { ...GSM, id: 'g1', isActive: false },
      { id: 'g2', terms: ['portable', 'mobile'], isActive: true },
    ]);
    await expect(service.setActive('g1', true)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('deletes only after confirming the group exists', async () => {
    const { service, prisma } = makeService();
    await expect(service.remove('ghost')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.searchSynonym.delete).not.toHaveBeenCalled();
  });
});

describe('CreateSearchSynonymDto', () => {
  const check = async (payload: unknown) =>
    validate(plainToInstance(CreateSearchSynonymDto, payload));

  it('trims, collapses whitespace and de-duplicates case-insensitively', async () => {
    const dto = plainToInstance(CreateSearchSynonymDto, {
      terms: ['  gsm ', 'GSM', 'portable   téléphone', ''],
    });
    expect(dto.terms).toEqual(['gsm', 'portable téléphone']);
  });

  // A group is a SET of interchangeable terms, so one term expands to nothing.
  it('rejects a group with fewer than 2 distinct terms', async () => {
    expect((await check({ terms: ['gsm', 'GSM'] })).length).toBeGreaterThan(0);
    expect((await check({ terms: ['gsm'] })).length).toBeGreaterThan(0);
    expect((await check({ terms: [] })).length).toBeGreaterThan(0);
  });

  it('rejects a 1-character term and an over-long one', async () => {
    expect((await check({ terms: ['a', 'portable'] })).length).toBeGreaterThan(0);
    expect((await check({ terms: ['x'.repeat(61), 'portable'] })).length).toBeGreaterThan(0);
  });

  it('rejects more than 25 terms', async () => {
    const terms = Array.from({ length: 26 }, (_, i) => `terme${i}`);
    expect((await check({ terms })).length).toBeGreaterThan(0);
  });

  it('accepts a valid group', async () => {
    expect(await check({ terms: ['frigo', 'réfrigérateur'], note: 'usage local' })).toEqual([]);
  });
});

/**
 * These routes are the only WRITE surface under `v1/admin/reports`: a caller
 * who reached them could reshape every buyer's search results. The e2e file
 * asserts 401 for anonymous callers, but 401 comes from the global
 * JwtAuthGuard and would still fire with `@Roles` missing — so an
 * authenticated BUYER or SELLER would sail through. Assert the role metadata
 * itself, which is what RolesGuard reads.
 */
describe('SearchSynonymsController — authorization metadata', () => {
  it('is restricted to ADMIN at the controller level', () => {
    const roles = new Reflector().get<string[]>(ROLES_KEY, SearchSynonymsController);
    expect(roles).toEqual(['ADMIN']);
  });

  it('no handler widens the role beyond the controller', () => {
    const reflector = new Reflector();
    const proto = SearchSynonymsController.prototype as unknown as Record<string, unknown>;
    const handlers = Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor');
    expect(handlers.length).toBeGreaterThan(0);
    for (const name of handlers) {
      const roles = reflector.get<string[]>(ROLES_KEY, proto[name] as () => unknown);
      // Undefined means "inherit the controller's ADMIN", which is correct.
      if (roles !== undefined) expect(roles).toEqual(['ADMIN']);
    }
  });
});
