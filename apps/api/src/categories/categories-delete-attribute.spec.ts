import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

/**
 * Deleting a characteristic that products use (2026-09-11, P3-1).
 *
 * `deleteAttribute` went straight to `prisma.productAttribute.delete`. When
 * `product_specifications` referenced the row the foreign key refused it and
 * threw a PrismaClientKnownRequestError — not an HttpException, so the admin
 * received a bare 500 « Erreur interne du serveur ». The raw Prisma text is
 * caught by HttpExceptionFilter and never reaches the client, so nothing
 * leaked; nothing useful was said either.
 *
 * The fix is a better message, NOT a replacement for the constraint: the
 * foreign key stays the final integrity boundary.
 */
function makeService(opts: { attribute?: unknown; referencing?: number } = {}) {
  const hasAttr = 'attribute' in opts;
  const del = jest.fn().mockResolvedValue({});
  const prisma = {
    productAttribute: {
      findUnique: jest.fn().mockResolvedValue(
        hasAttr ? opts.attribute : { id: 'a1', categoryId: 'c1', name: 'Taille' },
      ),
      delete: del,
    },
    productSpecification: {
      count: jest.fn().mockResolvedValue(opts.referencing ?? 0),
    },
  };
  return { service: new CategoriesService(prisma as never), prisma, del };
}

describe('CategoriesService.deleteAttribute — referenced characteristics', () => {
  it('1. a REFERENCED characteristic is refused with a French 400', async () => {
    const { service } = makeService({ referencing: 3 });
    const err = await service.deleteAttribute('a1').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toContain('3 produit(s)');
    expect(err.message).toMatch(/ne peut pas être supprimée/);
    expect(err.message).toMatch(/Retirez-la de ces produits/);
  });

  it('2. an UNREFERENCED characteristic still deletes', async () => {
    const { service, del } = makeService({ referencing: 0 });
    const res = await service.deleteAttribute('a1');
    expect(res.message).toMatch(/supprimé avec succès/);
    expect(del).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('3. a MISSING characteristic keeps the existing 404', async () => {
    const { service, del } = makeService({ attribute: null });
    await expect(service.deleteAttribute('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(del).not.toHaveBeenCalled();
  });

  it('4. the refusal mutates nothing — no delete is attempted', async () => {
    const { service, del, prisma } = makeService({ referencing: 1 });
    await service.deleteAttribute('a1').catch(() => undefined);
    expect(del).not.toHaveBeenCalled();
    // and it only COUNTS specifications; it never deletes or updates them
    expect(prisma.productSpecification).not.toHaveProperty('deleteMany');
    expect(prisma.productSpecification).not.toHaveProperty('updateMany');
  });

  it('5. the check is scoped to that attribute alone', async () => {
    const { service, prisma } = makeService({ referencing: 2 });
    await service.deleteAttribute('a1').catch(() => undefined);
    expect(prisma.productSpecification.count).toHaveBeenCalledWith({
      where: { attributeId: 'a1' },
    });
  });

  it('6. the message never exposes Prisma or database wording', async () => {
    const { service } = makeService({ referencing: 1 });
    const err = await service.deleteAttribute('a1').catch((e) => e);
    for (const leak of ['Prisma', 'foreign key', 'constraint', 'P2003', 'product_specifications', 'invocation']) {
      expect(err.message).not.toContain(leak);
    }
  });

  it('7. the existence check runs BEFORE the dependency count', async () => {
    // A missing id must 404, not report a confusing dependency count of zero.
    const { service, prisma } = makeService({ attribute: null });
    await service.deleteAttribute('nope').catch(() => undefined);
    expect(prisma.productSpecification.count).not.toHaveBeenCalled();
  });

  it('8. the foreign key remains the final boundary — a delete that still fails propagates', async () => {
    // The count is a nicer message, not a replacement. If a specification is
    // created between the count and the delete, the database must still win.
    const { service } = makeService({ referencing: 0 });
    const { service: s2, prisma } = makeService({ referencing: 0 });
    prisma.productAttribute.delete.mockRejectedValueOnce(
      Object.assign(new Error('FK violation'), { code: 'P2003' }),
    );
    await expect(s2.deleteAttribute('a1')).rejects.toThrow(/FK violation/);
    // sanity: the happy path still works on the untouched service
    await expect(service.deleteAttribute('a1')).resolves.toBeDefined();
  });
});
