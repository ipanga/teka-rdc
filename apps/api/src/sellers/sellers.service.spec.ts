import { BadRequestException, ConflictException } from '@nestjs/common';
import { SellersService } from './sellers.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

const COMMUNE_ID = '02000000-0000-0000-0000-000000000001';
const CITY_ID = '01000000-0000-0000-0000-000000000002';
const DOC_ID = 'teka-rdc/seller-documents/abc123';

// Minimal Prisma + Cloudinary mocks for the methods these tests touch.
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
  const cloudinary = {
    uploadPrivateImage: jest.fn(),
    getSignedImageUrl: jest.fn(),
  };
  const prisma = { sellerProfile, commune };
  const service = new SellersService(prisma as never, cloudinary as never);
  return { service, sellerProfile, commune, cloudinary };
}

const dto: ApplySellerDto = {
  businessName: 'Boutique Kinshasa',
  businessType: 'individual',
  idNumber: 'ID-12345',
  idType: 'national_id',
  phone: '+243812345678',
  location: 'Lubumbashi, Katuba',
  communeId: COMMUNE_ID,
  idDocumentCloudinaryId: DOC_ID,
  description: 'Vente de fournitures',
};

// The static fields apply() persists: dto minus cityId, with cityId derived
// from the commune. (idDocumentUploadedAt is a fresh Date, asserted separately.)
const persisted = {
  businessName: dto.businessName,
  businessType: dto.businessType,
  idNumber: dto.idNumber,
  idType: dto.idType,
  phone: dto.phone,
  location: dto.location,
  communeId: COMMUNE_ID,
  idDocumentCloudinaryId: DOC_ID,
  description: dto.description,
  cityId: CITY_ID,
};

const userId = '10000000-0000-0000-0000-000000000abc';

type WriteCall = [{ where?: unknown; data: Record<string, unknown> }];

describe('SellersService.apply', () => {
  it('creates a PENDING profile with cityId derived + document stamped', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    sellerProfile.create.mockResolvedValue({
      id: 'p1',
      applicationStatus: 'PENDING',
    });

    await service.apply(userId, dto);

    const calls = sellerProfile.create.mock.calls as unknown as WriteCall[];
    const data = calls[0][0].data;
    expect(data).toMatchObject({ ...persisted, userId });
    expect(data.idDocumentUploadedAt).toBeInstanceOf(Date);
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

    const calls = sellerProfile.update.mock.calls as unknown as WriteCall[];
    const arg = calls[0][0];
    expect(arg.where).toEqual({ userId });
    expect(arg.data).toMatchObject({
      ...persisted,
      applicationStatus: 'PENDING',
      rejectionReason: null,
      approvedAt: null,
      approvedById: null,
    });
    expect(arg.data.idDocumentUploadedAt).toBeInstanceOf(Date);
  });
});

describe('SellersService.uploadDocument', () => {
  const file = (over: Partial<Express.Multer.File>) =>
    ({
      size: 1024,
      mimetype: 'image/jpeg',
      buffer: Buffer.from('x'),
      ...over,
    }) as unknown as Express.Multer.File;

  it('uploads a valid image to the private folder', async () => {
    const { service, cloudinary } = makeService();
    cloudinary.uploadPrivateImage.mockResolvedValue({ cloudinaryId: DOC_ID });

    const res = await service.uploadDocument(file({}));

    expect(cloudinary.uploadPrivateImage).toHaveBeenCalled();
    expect(res.cloudinaryId).toBe(DOC_ID);
  });

  it('rejects an oversized file', async () => {
    const { service } = makeService();
    await expect(
      service.uploadDocument(file({ size: 6 * 1024 * 1024 })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unsupported MIME type', async () => {
    const { service } = makeService();
    await expect(
      service.uploadDocument(file({ mimetype: 'application/pdf' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
