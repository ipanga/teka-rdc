import { BadRequestException, ConflictException } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

const COMMUNE_ID = '02000000-0000-0000-0000-000000000001';
const CITY_ID = '01000000-0000-0000-0000-000000000002';

// Minimal Prisma mock — the sellerProfile + commune delegates apply() touches.
function makeService() {
  const sellerProfile = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const commune = {
    // Default: the commune resolves to CITY_ID (apply derives cityId from it).
    findUnique: jest
      .fn()
      .mockResolvedValue({ id: COMMUNE_ID, cityId: CITY_ID }),
  };
  const prisma = { sellerProfile, commune };
  const service = new SellersService(prisma as never);
  return { service, sellerProfile, commune };
}

const dto: ApplySellerDto = {
  businessName: 'Boutique Kinshasa',
  businessType: 'individual',
  idNumber: 'ID-12345',
  idType: 'national_id',
  phone: '+243812345678',
  location: 'Lubumbashi, Katuba',
  communeId: COMMUNE_ID,
  description: 'Vente de fournitures',
};

// What apply() persists: dto minus cityId, with cityId derived from the commune.
const persisted = {
  businessName: dto.businessName,
  businessType: dto.businessType,
  idNumber: dto.idNumber,
  idType: dto.idType,
  phone: dto.phone,
  location: dto.location,
  communeId: COMMUNE_ID,
  description: dto.description,
  cityId: CITY_ID,
};

const userId = '10000000-0000-0000-0000-000000000abc';

describe('SellersService.apply', () => {
  it('creates a PENDING profile with cityId derived from the commune', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    sellerProfile.create.mockResolvedValue({
      id: 'p1',
      applicationStatus: 'PENDING',
    });

    await service.apply(userId, dto);

    expect(sellerProfile.create).toHaveBeenCalledWith({
      data: { ...persisted, userId },
    });
  });

  it('rejects with 400 when the commune does not exist', async () => {
    const { service, commune, sellerProfile } = makeService();
    commune.findUnique.mockResolvedValue(null);

    await expect(service.apply(userId, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(sellerProfile.create).not.toHaveBeenCalled();
  });

  it('rejects with 409 when an application is already PENDING', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue({
      applicationStatus: 'PENDING',
    });

    await expect(service.apply(userId, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(sellerProfile.create).not.toHaveBeenCalled();
    expect(sellerProfile.update).not.toHaveBeenCalled();
  });

  it('rejects with 409 when the user is already an APPROVED seller', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue({
      applicationStatus: 'APPROVED',
    });

    await expect(service.apply(userId, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(sellerProfile.update).not.toHaveBeenCalled();
  });

  it('allows re-application by resetting a REJECTED profile back to PENDING', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue({
      applicationStatus: 'REJECTED',
      rejectionReason: 'Document illisible',
    });
    sellerProfile.update.mockResolvedValue({
      id: 'p1',
      applicationStatus: 'PENDING',
    });

    await service.apply(userId, dto);

    expect(sellerProfile.update).toHaveBeenCalledWith({
      where: { userId },
      data: {
        ...persisted,
        applicationStatus: 'PENDING',
        rejectionReason: null,
        approvedAt: null,
        approvedById: null,
      },
    });
  });
});
