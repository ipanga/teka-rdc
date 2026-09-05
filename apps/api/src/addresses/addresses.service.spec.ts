import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CitiesService } from './../cities/cities.service';
import { CreateAddressDto } from './dto/create-address.dto';

// Real CitiesService over a tiny in-memory commune/city table, so the address
// tests exercise the actual resolver semantics (exists, active, belongs to the
// city) rather than a stub that always agrees.
const LUB = '01000000-0000-0000-0000-000000000001';
const KOL = '01000000-0000-0000-0000-000000000002';
const KAMPEMBA = '02000000-0000-0000-0000-000000000002';
const DILALA = '02000000-0000-0000-0000-000000000010'; // Kolwezi
const RETIRED = '02000000-0000-0000-0000-000000000099'; // Lubumbashi, isActive=false
const COMMUNES: Record<string, { id: string; name: string; cityId: string; isActive: boolean }> = {
  [KAMPEMBA]: { id: KAMPEMBA, name: 'Kampemba', cityId: LUB, isActive: true },
  [DILALA]: { id: DILALA, name: 'Dilala', cityId: KOL, isActive: true },
  [RETIRED]: { id: RETIRED, name: 'Ancienne commune', cityId: LUB, isActive: false },
};
function citiesService() {
  const prisma = {
    commune: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) => {
        const c = COMMUNES[where.id];
        return Promise.resolve(c ? { ...c, city: { isActive: true } } : null);
      }),
    },
    city: {
      findFirst: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve([LUB, KOL].includes(where.id) ? { id: where.id } : null),
      ),
    },
  };
  return new CitiesService(prisma as never);
}

/**
 * A buyer holds exactly one current delivery address, enforced server-side so
 * the rule cannot be bypassed from the web client. POST is therefore an upsert.
 *
 * Sellers and admins deliberately keep the old multi-address behaviour: the
 * single-address rule is a buyer product decision, and a partial unique index
 * on addresses("userId") — the obvious DB-level guard — cannot be scoped by
 * users.role, so it would silently cap them too.
 */

const dto: CreateAddressDto = {
  province: 'Haut-Katanga',
  town: 'Lubumbashi',
  neighborhood: 'Kampemba',
  avenue: 'Av. Lumumba 24',
};

function makeService(opts: {
  role?: 'BUYER' | 'SELLER' | 'ADMIN';
  existing?: Record<string, unknown> | null;
}) {
  const { role = 'BUYER', existing = null } = opts;

  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'u1' }]),
    user: { findUnique: jest.fn().mockResolvedValue({ role }) },
    address: {
      findFirst: jest.fn().mockResolvedValue(existing),
      create: jest.fn((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'new-addr', ...args.data }),
      ),
      update: jest.fn((args: { where: { id: string }; data: Record<string, unknown> }) =>
        Promise.resolve({ id: args.where.id, ...args.data }),
      ),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
    address: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  return { service: new AddressesService(prisma as never, citiesService()), prisma, tx };
}

describe('AddressesService.create — one address per buyer', () => {
  it('creates the first address and marks it default', async () => {
    const { service, tx } = makeService({ existing: null });

    const result = await service.create('u1', dto);

    expect(tx.address.create).toHaveBeenCalledTimes(1);
    expect(tx.address.update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ town: 'Lubumbashi', isDefault: true });
  });

  it('updates the existing address instead of creating a second', async () => {
    const { service, tx } = makeService({
      existing: { id: 'addr-1', town: 'Likasi' },
    });

    const result = await service.create('u1', dto);

    expect(tx.address.create).not.toHaveBeenCalled();
    expect(tx.address.update).toHaveBeenCalledTimes(1);
    expect(tx.address.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-1' } }),
    );
    expect(result).toMatchObject({ id: 'addr-1', town: 'Lubumbashi' });
  });

  it('takes a row lock on the owner so concurrent creates serialize', async () => {
    const { service, tx } = makeService({ existing: null });

    await service.create('u1', dto);

    expect(tx.$queryRaw).toHaveBeenCalled();
    // The lock must be taken before the read that decides create-vs-update,
    // otherwise two simultaneous POSTs both see "no address" and both insert.
    const lockOrder = tx.$queryRaw.mock.invocationCallOrder[0];
    const readOrder = tx.address.findFirst.mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(readOrder);
  });

  it('runs the whole decision inside one transaction', async () => {
    const { service, prisma } = makeService({ existing: null });
    await service.create('u1', dto);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('clears optional fields the payload omits (full replace, not merge)', async () => {
    const { service, tx } = makeService({
      existing: { id: 'addr-1', reference: 'Ancien repère', recipientPhone: '+243990000001' },
    });

    await service.create('u1', dto); // dto carries no reference / recipientPhone

    expect(tx.address.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reference: null, recipientPhone: null }),
      }),
    );
  });

  it('leaves sellers on the original multi-address behaviour', async () => {
    const { service, tx } = makeService({
      role: 'SELLER',
      existing: { id: 'addr-1' },
    });

    await service.create('u1', dto);

    expect(tx.address.create).toHaveBeenCalledTimes(1);
    expect(tx.address.update).not.toHaveBeenCalled();
  });

  it('does not archive a legacy buyer duplicate as a side effect', async () => {
    // Extra rows are archived only by the reported migration, never silently
    // by a write path.
    const { service, tx } = makeService({
      existing: { id: 'addr-1' },
    });

    await service.create('u1', dto);

    expect(tx.address.updateMany).not.toHaveBeenCalled();
  });
});

describe('AddressesService authorization', () => {
  // update() reads through findOneOrFail and writes directly — no transaction.
  function serviceFor(address: Record<string, unknown> | null) {
    const prisma = {
      address: {
        findUnique: jest.fn().mockResolvedValue(address),
        update: jest.fn().mockResolvedValue({ id: 'addr-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { service: new AddressesService(prisma as never, citiesService()), prisma };
  }

  it("refuses to edit another buyer's address", async () => {
    const { service } = serviceFor({ id: 'addr-1', userId: 'someone-else' });
    await expect(service.update('u1', 'addr-1', dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('404s an unknown address', async () => {
    const { service } = serviceFor(null);
    await expect(service.update('u1', 'missing', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows the owner to edit', async () => {
    const { service, prisma } = serviceFor({ id: 'addr-1', userId: 'u1' });
    await service.update('u1', 'addr-1', { town: 'Kolwezi' });
    expect(prisma.address.update).toHaveBeenCalled();
  });
});

describe('AddressesService — Ville ↔ Commune validated server-side (same resolver as sellers)', () => {
  const base = { ...dto, cityId: LUB };

  it('accepts a commune of the selected city and persists the pair from the resolver', async () => {
    const { service, tx } = makeService({ existing: null });
    const res = await service.create('u1', { ...base, communeId: KAMPEMBA });
    expect(res).toMatchObject({ cityId: LUB, communeId: KAMPEMBA });
    expect(tx.address.create).toHaveBeenCalledTimes(1);
  });

  it('refuses a commune that belongs to another city (400, French, no internals)', async () => {
    const { service, tx } = makeService({ existing: null });
    await expect(service.create('u1', { ...base, communeId: DILALA })).rejects.toMatchObject({
      status: 400,
      message: 'La commune ne correspond pas à la ville sélectionnée',
    });
    expect(tx.address.create).not.toHaveBeenCalled();
  });

  it('refuses a retired commune and an unknown commune', async () => {
    const { service } = makeService({ existing: null });
    await expect(service.create('u1', { ...base, communeId: RETIRED })).rejects.toMatchObject({ status: 400, message: 'Commune inactive' });
    await expect(service.create('u1', { ...base, communeId: '02000000-0000-0000-0000-00000000dead' })).rejects.toMatchObject({ status: 400, message: 'Commune invalide' });
    await expect(service.create('u1', { ...base, communeId: RETIRED })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a city alone must be an active city; the commune is then null', async () => {
    const { service } = makeService({ existing: null });
    expect(await service.create('u1', { ...dto, cityId: LUB })).toMatchObject({ cityId: LUB, communeId: null });
    await expect(service.create('u1', { ...dto, cityId: '01000000-0000-0000-0000-0000000000ff' })).rejects.toMatchObject({ status: 400, message: 'Ville invalide ou inactive' });
  });

  it('applies the same rule to the buyer upsert path (existing address replaced)', async () => {
    const { service, tx } = makeService({ existing: { id: 'addr-1', cityId: LUB, communeId: KAMPEMBA } });
    await expect(service.create('u1', { ...dto, cityId: KOL, communeId: KAMPEMBA })).rejects.toMatchObject({ status: 400 });
    expect(tx.address.update).not.toHaveBeenCalled();
  });

  function updater(address: Record<string, unknown>) {
    const prisma = {
      address: {
        findUnique: jest.fn().mockResolvedValue({ id: 'addr-1', userId: 'u1', ...address }),
        update: jest.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: 'addr-1', ...args.data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return { service: new AddressesService(prisma as never, citiesService()), prisma };
  }

  it('PATCH: changing the city while keeping the previous commune drops that commune', async () => {
    const { service, prisma } = updater({ cityId: LUB, communeId: KAMPEMBA });
    const res = await service.update('u1', 'addr-1', { cityId: KOL, town: 'Kolwezi' });
    expect(res).toMatchObject({ cityId: KOL, communeId: null });
    expect(prisma.address.update.mock.calls[0][0].data).toMatchObject({ cityId: KOL, communeId: null, town: 'Kolwezi' });
  });

  it('PATCH: explicitly sending a commune of another city is refused', async () => {
    const { service, prisma } = updater({ cityId: LUB, communeId: KAMPEMBA });
    await expect(service.update('u1', 'addr-1', { cityId: KOL, communeId: KAMPEMBA })).rejects.toMatchObject({ status: 400 });
    await expect(service.update('u1', 'addr-1', { communeId: DILALA })).rejects.toMatchObject({ status: 400, message: 'La commune ne correspond pas à la ville sélectionnée' });
    expect(prisma.address.update).not.toHaveBeenCalled();
  });

  it('PATCH: a commune alone re-derives the city from the commune', async () => {
    const { service } = updater({ cityId: LUB, communeId: KAMPEMBA });
    const res = await service.update('u1', 'addr-1', { cityId: KOL, communeId: DILALA });
    expect(res).toMatchObject({ cityId: KOL, communeId: DILALA });
  });

  it('an address whose commune was retired later stays readable and editable, but the retired commune cannot be re-selected', async () => {
    // Read: findAll joins nothing, so a dangling/retired commune never throws.
    const prisma = { address: { findMany: jest.fn().mockResolvedValue([{ id: 'addr-1', cityId: LUB, communeId: RETIRED }]) } };
    const reader = new AddressesService(prisma as never, citiesService());
    expect(await reader.findAll('u1')).toEqual([{ id: 'addr-1', cityId: LUB, communeId: RETIRED }]);
    // Edit that leaves the pair alone: not re-validated.
    const { service, prisma: p2 } = updater({ cityId: LUB, communeId: RETIRED });
    expect(await service.update('u1', 'addr-1', { label: 'Maison' })).toMatchObject({ label: 'Maison', cityId: LUB, communeId: RETIRED });
    expect(p2.address.update).toHaveBeenCalledTimes(1);
    // Re-selecting the retired commune explicitly is refused.
    await expect(service.update('u1', 'addr-1', { communeId: RETIRED })).rejects.toMatchObject({ status: 400, message: 'Commune inactive' });
  });

  it('getNeighborhoods lists only active communes', async () => {
    const prisma = {
      city: { findFirst: jest.fn().mockResolvedValue({ id: LUB }) },
      commune: { findMany: jest.fn().mockResolvedValue([{ name: 'Kampemba' }]) },
    };
    const service = new AddressesService(prisma as never, citiesService());
    expect(await service.getNeighborhoods('Lubumbashi')).toEqual(['Kampemba']);
    expect(prisma.commune.findMany).toHaveBeenCalledWith({ where: { cityId: LUB, isActive: true }, orderBy: { sortOrder: 'asc' } });
  });
});
