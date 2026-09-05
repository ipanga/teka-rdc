import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { SellersService } from './sellers.service';
import { CitiesService } from '../cities/cities.service';
import { ApplySellerDto } from './dto/apply-seller.dto';

const COMMUNE_ID = '02000000-0000-0000-0000-000000000001';
const CITY_ID = '01000000-0000-0000-0000-000000000002';
const OTHER_CITY_ID = '01000000-0000-0000-0000-000000000003';
const DOC_ID = 'teka-rdc/seller-documents/abc123';

// Minimal Prisma + Cloudinary mocks for the methods these tests touch. The
// REAL CitiesService runs on the same prisma mock so the city ↔ commune rule
// is exercised end-to-end, not stubbed.
function makeService() {
  const sellerProfile = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const commune = {
    // Default: an active commune of an active CITY_ID (apply derives cityId
    // from it).
    findUnique: jest.fn().mockResolvedValue({
      id: COMMUNE_ID,
      name: 'Kampemba',
      cityId: CITY_ID,
      isActive: true,
      city: { isActive: true },
    }),
    // Default: every city has an active commune library.
    count: jest.fn().mockResolvedValue(6),
  };
  const city = {
    findFirst: jest.fn().mockResolvedValue({ id: CITY_ID }),
  };
  const cloudinary = {
    uploadPrivateImage: jest.fn(),
    getSignedImageUrl: jest.fn(),
  };
  const prisma = { sellerProfile, commune, city };
  const cities = new CitiesService(prisma as never);
  const service = new SellersService(
    prisma as never,
    cloudinary as never,
    cities,
  );
  return { service, sellerProfile, commune, city, cloudinary };
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

  it('rejects a commune that belongs to another city than the one sent (city A + commune B)', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    await expect(
      service.apply(userId, { ...dto, cityId: OTHER_CITY_ID }),
    ).rejects.toThrow('La commune ne correspond pas à la ville sélectionnée');
    expect(sellerProfile.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive commune', async () => {
    const { service, commune, sellerProfile } = makeService();
    commune.findUnique.mockResolvedValue({
      id: COMMUNE_ID,
      name: 'Kampemba',
      cityId: CITY_ID,
      isActive: false,
      city: { isActive: true },
    });
    await expect(service.apply(userId, dto)).rejects.toThrow(
      'Commune inactive',
    );
    expect(sellerProfile.create).not.toHaveBeenCalled();
  });

  it('requires the commune when the chosen city has an active commune library', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    const { communeId: _omit, ...withoutCommune } = dto;
    await expect(
      service.apply(userId, { ...withoutCommune, cityId: CITY_ID }),
    ).rejects.toThrow('La commune est requise pour cette ville');
    expect(sellerProfile.create).not.toHaveBeenCalled();
  });

  it('accepts city-only when that city has no commune library yet (D2: no invented communes)', async () => {
    const { service, sellerProfile, commune } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    sellerProfile.create.mockResolvedValue({ id: 'p1' });
    commune.count.mockResolvedValue(0); // e.g. Likasi today
    const { communeId: _omit, ...withoutCommune } = dto;

    await service.apply(userId, { ...withoutCommune, cityId: CITY_ID });

    const calls = sellerProfile.create.mock.calls as unknown as WriteCall[];
    expect(calls[0][0].data).toMatchObject({
      cityId: CITY_ID,
      communeId: null,
    });
  });

  it('requires a city when no commune is sent', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(null);
    const { communeId: _omit, ...withoutCommune } = dto;
    await expect(service.apply(userId, withoutCommune)).rejects.toThrow(
      'La ville est requise',
    );
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

describe('SellersService.updateProfile — the profile-edit path can no longer break the pair', () => {
  const approved = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    userId,
    applicationStatus: 'APPROVED',
    cityId: CITY_ID,
    communeId: COMMUNE_ID,
    ...over,
  });
  const updateData = (sellerProfile: { update: jest.Mock }) =>
    (sellerProfile.update.mock.calls as unknown as WriteCall[])[0][0].data;

  it('a commune sent with its city is resolved and persisted as a pair', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved({ communeId: null }));
    sellerProfile.update.mockResolvedValue({});
    await service.updateProfile(userId, {
      cityId: CITY_ID,
      communeId: COMMUNE_ID,
    });
    expect(updateData(sellerProfile)).toEqual({
      cityId: CITY_ID,
      communeId: COMMUNE_ID,
    });
  });

  it('a commune sent alone derives the city from the commune', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved({ cityId: null, communeId: null }));
    sellerProfile.update.mockResolvedValue({});
    await service.updateProfile(userId, { communeId: COMMUNE_ID });
    expect(updateData(sellerProfile)).toEqual({
      cityId: CITY_ID,
      communeId: COMMUNE_ID,
    });
  });

  it('city A + commune of city B is refused before any write (the pre-PR-1 hole)', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved());
    await expect(
      service.updateProfile(userId, {
        cityId: OTHER_CITY_ID,
        communeId: COMMUNE_ID,
      }),
    ).rejects.toThrow('La commune ne correspond pas à la ville sélectionnée');
    expect(sellerProfile.update).not.toHaveBeenCalled();
  });

  it('changing the city alone is refused when the new city has communes (the stale commune is never kept)', async () => {
    const { service, sellerProfile, city } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved());
    city.findFirst.mockResolvedValue({ id: OTHER_CITY_ID });
    await expect(
      service.updateProfile(userId, { cityId: OTHER_CITY_ID }),
    ).rejects.toThrow('La commune est requise pour cette ville');
    expect(sellerProfile.update).not.toHaveBeenCalled();
  });

  it('changing the city alone to a city WITHOUT communes clears the old commune', async () => {
    const { service, sellerProfile, city, commune } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved());
    city.findFirst.mockResolvedValue({ id: OTHER_CITY_ID });
    commune.count.mockResolvedValue(0);
    sellerProfile.update.mockResolvedValue({});
    await service.updateProfile(userId, { cityId: OTHER_CITY_ID });
    expect(updateData(sellerProfile)).toEqual({
      cityId: OTHER_CITY_ID,
      communeId: null,
    });
  });

  it('re-sending the current city alone keeps the current commune (idempotent edit)', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved());
    sellerProfile.update.mockResolvedValue({});
    await service.updateProfile(userId, { cityId: CITY_ID, location: 'Av. Lumumba' });
    expect(updateData(sellerProfile)).toEqual({
      cityId: CITY_ID,
      location: 'Av. Lumumba',
    });
  });

  it('a legacy seller with communeId = NULL stays editable without a commune', async () => {
    const { service, sellerProfile } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved({ communeId: null }));
    sellerProfile.update.mockResolvedValue({});
    await service.updateProfile(userId, {
      businessName: 'Boutique Legacy',
      cityId: '',
      communeId: '',
    });
    expect(updateData(sellerProfile)).toEqual({ businessName: 'Boutique Legacy' });
  });

  it('inactive commune / inactive city / not-approved profile are refused', async () => {
    const { service, sellerProfile, commune, city } = makeService();
    sellerProfile.findUnique.mockResolvedValue(approved());
    commune.findUnique.mockResolvedValueOnce({
      id: COMMUNE_ID,
      name: 'Kampemba',
      cityId: CITY_ID,
      isActive: false,
      city: { isActive: true },
    });
    await expect(
      service.updateProfile(userId, { communeId: COMMUNE_ID }),
    ).rejects.toThrow('Commune inactive');
    city.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateProfile(userId, { cityId: OTHER_CITY_ID }),
    ).rejects.toThrow('Ville invalide ou inactive');
    sellerProfile.findUnique.mockResolvedValue(
      approved({ applicationStatus: 'PENDING' }),
    );
    await expect(
      service.updateProfile(userId, { businessName: 'X' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(sellerProfile.update).not.toHaveBeenCalled();
  });
});

describe('SellersService.uploadDocument (legacy application photo, PR 2 hardening)', () => {
  // A structurally valid JPEG: SOI, JFIF APP0, an EXIF APP1 carrying a
  // marker, SOS, scan bytes, EOI.
  const seg = (marker: number, payload: Buffer) => {
    const len = Buffer.alloc(2);
    len.writeUInt16BE(payload.length + 2);
    return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
  };
  const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0GPS-MARKER', 'latin1')),
    seg(0xda, Buffer.alloc(2)),
    Buffer.from([0x01, 0xff, 0xd9]),
  ]);
  const file = (over: Partial<Express.Multer.File>) =>
    ({
      size: JPEG.length,
      mimetype: 'image/jpeg',
      buffer: JPEG,
      ...over,
    }) as unknown as Express.Multer.File;

  it('uploads a valid image to the private folder with its EXIF stripped', async () => {
    const { service, cloudinary } = makeService();
    cloudinary.uploadPrivateImage.mockResolvedValue({ cloudinaryId: DOC_ID });

    const res = await service.uploadDocument(file({}));

    expect(cloudinary.uploadPrivateImage).toHaveBeenCalledTimes(1);
    const sent: Buffer = cloudinary.uploadPrivateImage.mock.calls[0][0];
    expect(sent.toString('latin1')).not.toContain('GPS-MARKER');
    expect(sent.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(res.cloudinaryId).toBe(DOC_ID);
  });

  it('rejects bytes that are not an image even when labelled image/jpeg (forged MIME), and a PDF', async () => {
    const { service, cloudinary } = makeService();
    await expect(
      service.uploadDocument(file({ buffer: Buffer.from('MZ......'), size: 8 })),
    ).rejects.toThrow('Format non supporté');
    await expect(
      service.uploadDocument(
        file({ buffer: Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1'), size: 16 }),
      ),
    ).rejects.toThrow('Format non supporté');
    await expect(
      service.uploadDocument(file({ mimetype: 'image/png' })),
    ).rejects.toThrow('ne correspond pas à son format déclaré');
    expect(cloudinary.uploadPrivateImage).not.toHaveBeenCalled();
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
