import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateSearchSynonymDto,
  UpdateSearchSynonymDto,
} from './dto/search-synonym.dto';

/**
 * Admin CRUD for the synonym groups `BrowseService` expands queries with.
 *
 * The model was always described as admin-editable but had no write surface —
 * groups were editable only by direct SQL. This closes that, and nothing about
 * search itself changes: `BrowseService.getSynonymGroups()` keeps reading
 * `isActive: true` on a 60s cache, so an edit takes effect within a minute
 * without a deploy.
 *
 * Two rules the UI cannot enforce on its own:
 *
 *  - **Deactivate, never delete, a group that is doing work.** `isActive=false`
 *    is the reversible off switch the browse side already honours, and it keeps
 *    the note explaining why the group existed. Hard delete stays available for
 *    a group created by mistake.
 *  - **No overlapping active groups.** Two active groups sharing a term make
 *    query expansion order-dependent and effectively merge them by accident, so
 *    an overlap is refused with the offending term named.
 */
@Injectable()
export class SearchSynonymsService {
  constructor(private prisma: PrismaService) {}

  /** Folded comparison key — mirrors the browse side's accent/case folding. */
  private key(term: string): string {
    return term
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Refuses a group whose terms overlap another ACTIVE group. Inactive groups
   * are ignored: they expand nothing, so they cannot collide.
   */
  private async assertNoActiveOverlap(
    terms: string[],
    isActive: boolean,
    excludeId?: string,
  ) {
    if (!isActive) return;
    const incoming = new Map(terms.map((t) => [this.key(t), t]));
    const others = await this.prisma.searchSynonym.findMany({
      where: { isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, terms: true },
    });
    for (const other of others) {
      for (const term of other.terms) {
        const hit = incoming.get(this.key(term));
        if (hit) {
          throw new BadRequestException(
            `Le terme « ${hit} » appartient déjà à un autre groupe actif. ` +
              `Fusionnez les deux groupes ou désactivez l'autre.`,
          );
        }
      }
    }
  }

  /** Every group, newest first. Admin table — no pagination needed at this size. */
  async findAll() {
    const groups = await this.prisma.searchSynonym.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      groups,
      meta: {
        total: groups.length,
        active: groups.filter((g) => g.isActive).length,
      },
    };
  }

  async findOne(id: string) {
    const group = await this.prisma.searchSynonym.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Groupe de synonymes non trouvé');
    }
    return group;
  }

  async create(dto: CreateSearchSynonymDto) {
    const isActive = dto.isActive ?? true;
    await this.assertNoActiveOverlap(dto.terms, isActive);
    return this.prisma.searchSynonym.create({
      data: { terms: dto.terms, note: dto.note ?? null, isActive },
    });
  }

  async update(id: string, dto: UpdateSearchSynonymDto) {
    const existing = await this.findOne(id);
    const terms = dto.terms ?? existing.terms;
    const isActive = dto.isActive ?? existing.isActive;
    await this.assertNoActiveOverlap(terms, isActive, id);
    return this.prisma.searchSynonym.update({
      where: { id },
      data: {
        terms,
        isActive,
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
  }

  /** The reversible off switch — what the UI should offer by default. */
  async setActive(id: string, isActive: boolean) {
    const existing = await this.findOne(id);
    if (existing.isActive === isActive) return existing;
    await this.assertNoActiveOverlap(existing.terms, isActive, id);
    return this.prisma.searchSynonym.update({
      where: { id },
      data: { isActive },
    });
  }

  /**
   * Hard delete. The row has no dependents — nothing references a synonym
   * group — so this is safe, but it also throws away the note, which is why
   * `setActive(false)` is the documented default.
   */
  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.searchSynonym.delete({ where: { id } });
    return { id, deleted: true };
  }
}
