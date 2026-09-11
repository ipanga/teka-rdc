import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { AttributeType, ProductStatus } from '@prisma/client';
import {
  buildCategoryStructure,
  childCountOf,
  refuseCyclicReparent,
  refuseDepthOverflow,
  refuseGainingFirstChild,
  refuseLosingLastChild,
  type CategoryStructure,
  type TransitionRefusal,
} from '../common/taxonomy/category-structure';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Snapshot of the tree as the RUNTIME sees it.
   *
   * `deletedAt: null` only — deliberately NOT filtered by `isActive`, because
   * `BrowseService.getCategoryAttributes` counts children the same way. A guard
   * that used a different definition of "child" would protect a tree nobody
   * reads. One query; production holds 195 live rows.
   */
  private async loadStructure(): Promise<CategoryStructure> {
    const nodes = await this.prisma.category.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, parentCategoryId: true },
    });
    return buildCategoryStructure(nodes);
  }

  /** Characteristics stored on a node — hidden or served, they all count. */
  private countAttributes(categoryId: string): Promise<number> {
    return this.prisma.productAttribute.count({ where: { categoryId } });
  }

  /**
   * Products that would be stranded on a node. Same population as the delete
   * guard: ARCHIVED and soft-deleted products are already retired, so they
   * never block.
   */
  private countBlockingProducts(categoryId: string): Promise<number> {
    return this.prisma.product.count({
      where: {
        categoryId,
        deletedAt: null,
        status: { notIn: [ProductStatus.ARCHIVED] },
      },
    });
  }

  private static refuse(refusal: TransitionRefusal | null): void {
    if (refusal) throw new BadRequestException(refusal.message);
  }

  /**
   * Returns the full category tree (3 levels: category → subcategory → product
   * type). The relation is exposed as `children` (recursively) — the shape the
   * admin tree + parent-picker consume — with `_count.products` per node.
   */
  async findTree() {
    const categories = await this.prisma.category.findMany({
      where: { parentCategoryId: null, deletedAt: null },
      include: {
        _count: { select: { products: true } },
        subcategories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: {
            _count: { select: { products: true } },
            subcategories: {
              where: { deletedAt: null },
              orderBy: { sortOrder: 'asc' },
              include: { _count: { select: { products: true } } },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    // Map the `subcategories` relation onto `children` (recursively) so the
    // admin UI renders all 3 levels and the parent picker lists every node.
    type Raw = { subcategories?: Raw[]; [k: string]: unknown };
    const toNode = (c: Raw): Record<string, unknown> => {
      const { subcategories, ...rest } = c;
      return { ...rest, children: (subcategories ?? []).map(toNode) };
    };
    return { data: categories.map((c) => toNode(c as Raw)) };
  }

  /**
   * Returns a single category by ID with its attributes and subcategories.
   */
  async findById(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
      include: {
        attributes: {
          orderBy: { sortOrder: 'asc' },
        },
        subcategories: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    return category;
  }

  /**
   * Creates a new category. Validates max depth of 3 levels.
   */
  async create(dto: CreateCategoryDto) {
    if (dto.parentCategoryId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: dto.parentCategoryId, deletedAt: null },
      });

      if (!parent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }

      // If the parent already has a parent, it's level 2.
      // Adding a child would make level 3 — which is the maximum allowed.
      // But if the parent's parent also has a parent, that means the parent is level 3,
      // so we'd be creating level 4 — not allowed.
      if (parent.parentCategoryId) {
        const grandParent = await this.prisma.category.findUnique({
          where: { id: parent.parentCategoryId, deletedAt: null },
        });

        if (grandParent?.parentCategoryId) {
          throw new BadRequestException(
            'La profondeur maximale de catégories est de 3 niveaux',
          );
        }
      }

      // The parent is about to become an intermediate node if it is a leaf
      // today. Its own characteristics would stop being served and any product
      // sitting on it would be stranded — see category-structure.ts, GUARD A.
      const structure = await this.loadStructure();
      CategoriesService.refuse(
        refuseGainingFirstChild(
          { id: parent.id, name: parent.name, parentCategoryId: parent.parentCategoryId },
          childCountOf(structure, parent.id),
          await this.countAttributes(parent.id),
          await this.countBlockingProducts(parent.id),
        ),
      );
    }

    const category = await this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        parentCategoryId: dto.parentCategoryId,
        emoji: dto.emoji,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
      include: {
        attributes: true,
        subcategories: {
          where: { deletedAt: null },
        },
      },
    });

    return category;
  }

  /**
   * Updates an existing category.
   */
  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Re-parenting is the only field on this DTO that changes structure. Name,
    // description, emoji, sortOrder and isActive are left completely unguarded:
    // none of them moves a node, so none can change which characteristics the
    // API serves. The whole check is skipped when the parent is unchanged.
    if (
      dto.parentCategoryId !== undefined &&
      dto.parentCategoryId !== category.parentCategoryId
    ) {
      const newParent = dto.parentCategoryId
        ? await this.prisma.category.findUnique({
            where: { id: dto.parentCategoryId, deletedAt: null },
          })
        : null;

      if (dto.parentCategoryId && !newParent) {
        throw new NotFoundException('Catégorie parente non trouvée');
      }

      const structure = await this.loadStructure();

      // Order matters: a cyclic move makes depth meaningless, so rule it out
      // first. Every check below runs BEFORE any write — a refused re-parent
      // mutates nothing.
      if (newParent) {
        CategoriesService.refuse(
          refuseCyclicReparent(structure, id, newParent.id),
        );
      }

      CategoriesService.refuse(
        refuseDepthOverflow(structure, id, newParent?.id ?? null),
      );

      // The node LEAVES its current parent: that parent may lose its last child
      // and start serving hidden historical characteristics — GUARD B.
      if (category.parentCategoryId) {
        const oldParent = structure.byId.get(category.parentCategoryId);
        if (oldParent) {
          CategoriesService.refuse(
            refuseLosingLastChild(
              oldParent,
              childCountOf(structure, oldParent.id) - 1,
              await this.countAttributes(oldParent.id),
            ),
          );
        }
      }

      // The node ARRIVES under a new parent, which may be a leaf today — GUARD A.
      if (newParent) {
        CategoriesService.refuse(
          refuseGainingFirstChild(
            { id: newParent.id, name: newParent.name, parentCategoryId: newParent.parentCategoryId },
            childCountOf(structure, newParent.id),
            await this.countAttributes(newParent.id),
            await this.countBlockingProducts(newParent.id),
          ),
        );
      }
    }

    const updated = await this.prisma.category.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && {
          description: dto.description,
        }),
        ...(dto.parentCategoryId !== undefined && {
          parentCategoryId: dto.parentCategoryId,
        }),
        ...(dto.emoji !== undefined && { emoji: dto.emoji }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        attributes: true,
        subcategories: {
          where: { deletedAt: null },
        },
      },
    });

    return updated;
  }

  /**
   * Soft deletes a category and all its subcategories (cascade).
   */
  async softDelete(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id, deletedAt: null },
      include: {
        subcategories: {
          where: { deletedAt: null },
          include: {
            subcategories: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Deleting this node removes it from its parent's children. If it is the
    // LAST one, the parent silently becomes a product type and any historical
    // characteristic still stored on it goes live in seller forms — the exact
    // defect class P2/P3-1 spent two releases removing. Checked BEFORE the
    // transaction, so a refusal writes nothing at all. See GUARD B.
    if (category.parentCategoryId) {
      const structure = await this.loadStructure();
      const parent = structure.byId.get(category.parentCategoryId);
      if (parent) {
        CategoriesService.refuse(
          refuseLosingLastChild(
            parent,
            childCountOf(structure, parent.id) - 1,
            await this.countAttributes(parent.id),
          ),
        );
      }
    }

    const now = new Date();
    const idsToDelete: string[] = [id];

    // Collect all subcategory IDs (level 2)
    for (const sub of category.subcategories) {
      idsToDelete.push(sub.id);
      // Collect level 3 subcategory IDs
      for (const subSub of sub.subcategories) {
        idsToDelete.push(subSub.id);
      }
    }

    // Deleting a category that still holds products silently stranded them: the
    // rows keep their categoryId, `publicProductWhere` filters on the PRODUCT's
    // status only, so an ACTIVE product stayed browsable while its category page
    // 404'd — and the seller could not repair it, because a deleted category is
    // absent from every category picker.
    //
    // The check covers the WHOLE subtree because the delete does: this method
    // cascades to levels 2 and 3, so a child holding products must block the
    // parent's deletion just as firmly as the parent's own products.
    //
    // ARCHIVED and soft-deleted products do NOT block. Those are deliberately
    // retired and are not reachable by buyers or editable by sellers, so they
    // cannot be stranded in a way anyone has to repair. Everything else —
    // ACTIVE, DRAFT, PENDING_REVIEW, REJECTED, SUSPENDED — is a product someone
    // is still working with.
    //
    // Counted INSIDE the transaction, immediately before the write, so a product
    // created between an operator opening the page and confirming cannot slip
    // through. A residual window remains against a concurrent insert; closing it
    // fully would need row locks on products, which is disproportionate for an
    // admin action that a retry makes obvious.
    await this.prisma.$transaction(async (tx) => {
      const blocking = await tx.product.groupBy({
        by: ['categoryId'],
        where: {
          categoryId: { in: idsToDelete },
          deletedAt: null,
          status: { notIn: [ProductStatus.ARCHIVED] },
        },
        _count: { _all: true },
      });

      if (blocking.length > 0) {
        const total = blocking.reduce((sum, row) => sum + row._count._all, 0);
        const here = blocking.some((row) => row.categoryId === id);
        throw new BadRequestException(
          here && blocking.length === 1
            ? `Cette catégorie contient ${total} produit(s) actif(s). Déplacez ou archivez ces produits avant de la supprimer.`
            : `Cette catégorie ou ses sous-catégories contiennent ${total} produit(s) actif(s). ` +
              'Déplacez ou archivez ces produits avant de la supprimer.',
        );
      }

      await tx.category.updateMany({
        where: { id: { in: idsToDelete } },
        data: { deletedAt: now },
      });
    });

    return { message: 'Catégorie supprimée avec succès' };
  }

  /**
   * Creates a product attribute for a category.
   */
  async createAttribute(categoryId: string, dto: CreateAttributeDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId, deletedAt: null },
    });

    if (!category) {
      throw new NotFoundException('Catégorie non trouvée');
    }

    // Attributes attach per product type (the leaf). Adding them to a category
    // that has children would leak into every descendant's seller form (the
    // root cause of the cooker-attributes-on-a-monitor bug), so reject it here.
    const childCount = await this.prisma.category.count({
      where: { parentCategoryId: categoryId, deletedAt: null },
    });
    if (childCount > 0) {
      throw new BadRequestException(
        "Les caractéristiques ne peuvent être ajoutées qu'à un type de produit " +
          '(niveau le plus bas), pas à une catégorie ou sous-catégorie.',
      );
    }

    return this.prisma.productAttribute.create({
      data: {
        categoryId,
        name: dto.name,
        type: dto.type as AttributeType,
        options: dto.options ?? undefined,
        isRequired: dto.isRequired ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  /**
   * Updates a product attribute, validating it belongs to the specified category.
   */
  async updateAttribute(
    categoryId: string,
    attrId: string,
    dto: Partial<CreateAttributeDto>,
  ) {
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id: attrId },
    });

    if (!attribute || attribute.categoryId !== categoryId) {
      throw new NotFoundException('Attribut non trouvé pour cette catégorie');
    }

    return this.prisma.productAttribute.update({
      where: { id: attrId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type as AttributeType }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  /**
   * Deletes a product attribute.
   */
  async deleteAttribute(attrId: string) {
    const attribute = await this.prisma.productAttribute.findUnique({
      where: { id: attrId },
    });

    if (!attribute) {
      throw new NotFoundException('Attribut non trouvé');
    }

    // A characteristic that products have filled in cannot be deleted: the
    // `product_specifications.attributeId` foreign key refuses it, and until
    // now that refusal arrived as a raw PrismaClientKnownRequestError. Not an
    // HttpException, so the admin received a bare 500 « Erreur interne du
    // serveur » with no idea what went wrong or what to do — the raw text is
    // caught by HttpExceptionFilter and stays server-side, so nothing leaked,
    // but nothing useful was said either.
    //
    // Detect the dependency first and answer in the admin's own language. The
    // foreign key REMAINS the final integrity boundary: this check is a better
    // message, not a replacement for it — a specification created between this
    // count and the delete would still be refused by the database.
    const referencing = await this.prisma.productSpecification.count({
      where: { attributeId: attrId },
    });

    if (referencing > 0) {
      throw new BadRequestException(
        `Cette caractéristique est utilisée par ${referencing} produit(s) et ne peut pas être supprimée. ` +
          'Retirez-la de ces produits avant de la supprimer.',
      );
    }

    await this.prisma.productAttribute.delete({
      where: { id: attrId },
    });

    return { message: 'Attribut supprimé avec succès' };
  }

  /**
   * Reorders a set of sibling categories (nodes sharing the same parent — top
   * categories, subcategories, or product types). `orderedIds` is the full set
   * of one parent's children in the desired display order; each row's sortOrder
   * is set to its index. Validates the ids all share a single parent and that
   * none are missing/foreign before writing.
   */
  async reorderCategories(orderedIds: string[]) {
    const nodes = await this.prisma.category.findMany({
      where: { id: { in: orderedIds }, deletedAt: null },
      select: { id: true, parentCategoryId: true },
    });
    if (nodes.length !== orderedIds.length) {
      throw new BadRequestException(
        'Certaines catégories sont introuvables',
      );
    }
    const parents = new Set(nodes.map((n) => n.parentCategoryId ?? 'ROOT'));
    if (parents.size > 1) {
      throw new BadRequestException(
        'Toutes les catégories doivent avoir le même parent',
      );
    }
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.category.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return { reordered: orderedIds.length };
  }

  /**
   * Reorders a category's attributes. `orderedIds` is the full set of the
   * category's attribute ids in the desired display order; each row's
   * sortOrder is set to its index. Validates that the ids exactly match the
   * category's attributes (no foreign / missing ids) before writing.
   */
  async reorderAttributes(categoryId: string, orderedIds: string[]) {
    const existing = await this.prisma.productAttribute.findMany({
      where: { categoryId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((a) => a.id));

    if (
      orderedIds.length !== existingIds.size ||
      !orderedIds.every((id) => existingIds.has(id))
    ) {
      throw new BadRequestException(
        'La liste doit contenir exactement les attributs de cette catégorie',
      );
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.productAttribute.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return this.prisma.productAttribute.findMany({
      where: { categoryId },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
