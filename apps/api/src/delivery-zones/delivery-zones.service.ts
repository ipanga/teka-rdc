import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

@Injectable()
export class DeliveryZonesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Estimates the delivery fee between two towns/cities.
   *
   * Matching is **trim + case-insensitive** so a configured zone (e.g.
   * "Lubumbashi") still matches regardless of input casing/whitespace.
   * When NO active zone covers the route we return `found: false` with null
   * fees — we deliberately do NOT charge a silent default. The caller
   * (`CheckoutService`) blocks checkout with a clear message, so an
   * unconfigured route can never silently undercharge or show "Gratuit".
   */
  async estimateFee(fromTown: string, toTown: string) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: {
        fromTown: { equals: (fromTown ?? '').trim(), mode: 'insensitive' },
        toTown: { equals: (toTown ?? '').trim(), mode: 'insensitive' },
        isActive: true,
      },
    });

    if (zone) {
      return {
        data: {
          feeCDF: zone.feeCDF.toString(),
          feeUSD: zone.feeUSD?.toString() ?? null,
          found: true,
        },
      };
    }

    // No active zone for this route — signal "not found" (no default charge).
    return {
      data: {
        feeCDF: null as string | null,
        feeUSD: null as string | null,
        found: false,
      },
    };
  }

  /**
   * Returns all delivery zones ordered by fromTown, toTown.
   */
  async findAll() {
    const zones = await this.prisma.deliveryZone.findMany({
      orderBy: [{ fromTown: 'asc' }, { toTown: 'asc' }],
    });

    return {
      data: zones.map((zone) => ({
        ...zone,
        feeCDF: zone.feeCDF.toString(),
        feeUSD: zone.feeUSD?.toString() ?? null,
      })),
    };
  }

  /**
   * Creates a new delivery zone with BigInt conversion.
   */
  async create(dto: CreateDeliveryZoneDto) {
    // Check for duplicate zone
    const existing = await this.prisma.deliveryZone.findUnique({
      where: {
        fromTown_toTown: {
          fromTown: dto.fromTown,
          toTown: dto.toTown,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Une zone de livraison existe déjà pour ce trajet',
      );
    }

    const zone = await this.prisma.deliveryZone.create({
      data: {
        fromTown: dto.fromTown,
        toTown: dto.toTown,
        feeCDF: BigInt(dto.feeCDF),
        feeUSD: dto.feeUSD ? BigInt(dto.feeUSD) : undefined,
        isActive: dto.isActive ?? true,
      },
    });

    return {
      data: {
        ...zone,
        feeCDF: zone.feeCDF.toString(),
        feeUSD: zone.feeUSD?.toString() ?? null,
      },
    };
  }

  /**
   * Updates an existing delivery zone.
   */
  async update(id: string, dto: UpdateDeliveryZoneDto) {
    const zone = await this.prisma.deliveryZone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new NotFoundException('Zone de livraison non trouvée');
    }

    // If changing fromTown/toTown, check for conflicts
    const newFromTown = dto.fromTown ?? zone.fromTown;
    const newToTown = dto.toTown ?? zone.toTown;

    if (newFromTown !== zone.fromTown || newToTown !== zone.toTown) {
      const existing = await this.prisma.deliveryZone.findUnique({
        where: {
          fromTown_toTown: {
            fromTown: newFromTown,
            toTown: newToTown,
          },
        },
      });

      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Une zone de livraison existe déjà pour ce trajet',
        );
      }
    }

    const updated = await this.prisma.deliveryZone.update({
      where: { id },
      data: {
        ...(dto.fromTown !== undefined && { fromTown: dto.fromTown }),
        ...(dto.toTown !== undefined && { toTown: dto.toTown }),
        ...(dto.feeCDF !== undefined && { feeCDF: BigInt(dto.feeCDF) }),
        ...(dto.feeUSD !== undefined && { feeUSD: BigInt(dto.feeUSD) }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return {
      data: {
        ...updated,
        feeCDF: updated.feeCDF.toString(),
        feeUSD: updated.feeUSD?.toString() ?? null,
      },
    };
  }

  /**
   * Deletes a delivery zone.
   */
  async remove(id: string) {
    const zone = await this.prisma.deliveryZone.findUnique({
      where: { id },
    });

    if (!zone) {
      throw new NotFoundException('Zone de livraison non trouvée');
    }

    await this.prisma.deliveryZone.delete({
      where: { id },
    });

    return { message: 'Zone de livraison supprimée avec succès' };
  }
}
