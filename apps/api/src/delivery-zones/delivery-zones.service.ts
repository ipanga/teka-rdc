import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDeliveryZoneDto } from './dto/create-delivery-zone.dto';
import { UpdateDeliveryZoneDto } from './dto/update-delivery-zone.dto';

/** Default delivery fee when no zone is configured (5000 CDF = 500000 centimes) */
const DEFAULT_FEE_CDF = BigInt(500000);
/** Default delivery fee in USD (200 cents = $2.00) */
const DEFAULT_FEE_USD = BigInt(200);

@Injectable()
export class DeliveryZonesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Estimates the delivery fee between two towns.
   * Returns a default fee if no zone is configured.
   */
  async estimateFee(fromTown: string, toTown: string) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: {
        fromTown,
        toTown,
        isActive: true,
      },
    });

    if (zone) {
      return {
        data: {
          feeCDF: zone.feeCDF.toString(),
          feeUSD: zone.feeUSD?.toString() ?? null,
          isDefault: false,
        },
      };
    }

    // Return default fee when no zone is configured
    return {
      data: {
        feeCDF: DEFAULT_FEE_CDF.toString(),
        feeUSD: DEFAULT_FEE_USD.toString(),
        isDefault: true,
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
