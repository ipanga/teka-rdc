import { ConflictException } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

// Minimal Prisma mock — only the sellerProfile delegate methods apply() touches.
function makeService() {
  const sellerProfile = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { sellerProfile };
  const service = new SellersService(prisma as never);
  return { service, sellerProfile };
}

const dto: ApplySellerDto = {
  businessName: 'Boutique Kinshasa',
  businessType: 'individual',
  idNumber: 'ID-12345',
  idType: 'national_id',
  phone: '+243812345678',
  location: 'Lubumbashi, Katuba',
  description: 'Vente de fournitures',
};

const userId = '10000000-0000-0000-0000-000000000abc';

describe('SellersService.apply', () => {
  it('creates a PENDING profile when none exists (fresh applicant)', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    sellerProfile.create.mockResolvedValue({
      id: 'p1',
      applicationStatus: 'PENDING',
    });

    await service.apply(userId, dto);

    expect(sellerProfile.create).toHaveBeenCalledWith({
      data: { ...dto, userId },
    });
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
        ...dto,
        applicationStatus: 'PENDING',
        rejectionReason: null,
        approvedAt: null,
        approvedById: null,
      },
    });
  });
});
