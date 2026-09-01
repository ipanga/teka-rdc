import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';

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

  return { service: new AddressesService(prisma as never), prisma, tx };
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
    return { service: new AddressesService(prisma as never), prisma };
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
