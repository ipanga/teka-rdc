import { BadRequestException } from '@nestjs/common';
import { SellerDocumentType } from '@prisma/client';
import { SellerDocumentStorageService, SELLER_DOCUMENTS_FOLDER } from './seller-document-storage.service';

const PROFILE = '50000000-0000-0000-0000-000000000001';
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
const file = (over: Partial<Express.Multer.File>): Express.Multer.File =>
  ({ buffer: PDF, size: PDF.length, mimetype: 'application/pdf', originalname: 'rccm.pdf', ...over }) as Express.Multer.File;

function make(over: { maxMb?: number } = {}) {
  const sellerDocument = {
    create: jest.fn().mockImplementation(async ({ data }: any) => ({ ...data, uploadedAt: null, purgedAt: null })),
    delete: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const prisma = { sellerDocument };
  const cloudinary = {
    uploadPrivateDocument: jest.fn().mockResolvedValue({ cloudinaryId: 'x', bytes: 1 }),
    deletePrivateAsset: jest.fn().mockResolvedValue(true),
    getPrivateDownloadUrl: jest.fn().mockReturnValue('https://api.cloudinary.example/download?sig=1'),
  };
  const config = { get: (k: string) => ({ SELLER_DOCUMENT_MAX_MB: over.maxMb ?? 5, SELLER_DOCUMENT_RETENTION_DAYS: 90, SELLER_DOCUMENT_URL_TTL_SECONDS: 120 })[k] };
  const service = new SellerDocumentStorageService(prisma as never, cloudinary as never, config as never);
  return { service, sellerDocument, cloudinary };
}

describe('SellerDocumentStorageService.validate — server-side content rules', () => {
  it('accepts PDF, JPEG and PNG whose declared type agrees with the bytes', () => {
    const { service } = make();
    expect(service.validate(file({})).sniffed.kind).toBe('pdf');
    expect(service.validate(file({ buffer: PNG, size: PNG.length, mimetype: 'image/png' })).sniffed.kind).toBe('png');
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2]), Buffer.from([0xff, 0xd9])]);
    expect(service.validate(file({ buffer: jpeg, size: jpeg.length, mimetype: 'image/jpeg' })).sniffed.kind).toBe('jpeg');
  });

  it('rejects an oversized file, an unsupported format, a forged MIME and WebP', () => {
    const { service } = make({ maxMb: 1 });
    const big = Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]);
    expect(() => service.validate(file({ buffer: big, size: big.length }))).toThrow('ne doit pas dépasser 1 Mo');
    expect(() => service.validate(file({ buffer: Buffer.from('MZ......'), size: 8, mimetype: 'application/pdf' }))).toThrow('Format non supporté');
    expect(() => service.validate(file({ mimetype: 'image/jpeg' }))).toThrow('ne correspond pas à son format déclaré');
    const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(8)]);
    expect(() => service.validate(file({ buffer: webp, size: webp.length, mimetype: 'image/webp' }))).toThrow('Format non supporté');
    expect(() => service.validate(undefined)).toThrow(BadRequestException);
  });
});

describe('SellerDocumentStorageService.createAndUpload — row first, asset second, no drift', () => {
  it('creates the ownership row with an API-generated public_id BEFORE uploading, PDFs as raw with extension', async () => {
    const { service, sellerDocument, cloudinary } = make();
    const row = await service.createAndUpload({ sellerProfileId: PROFILE, type: SellerDocumentType.RCCM, label: null, file: file({}) });
    expect(sellerDocument.create).toHaveBeenCalledTimes(1);
    const data = sellerDocument.create.mock.calls[0][0].data;
    expect(data.cloudinaryId).toBe(`${SELLER_DOCUMENTS_FOLDER}/${PROFILE}/${data.id}.pdf`);
    expect(data).toMatchObject({ resourceType: 'raw', mimeType: 'application/pdf', originalName: 'rccm.pdf', status: 'PENDING', sizeBytes: PDF.length });
    expect(cloudinary.uploadPrivateDocument).toHaveBeenCalledWith(expect.any(Buffer), { publicId: data.cloudinaryId, resourceType: 'raw' });
    expect(cloudinary.uploadPrivateDocument.mock.invocationCallOrder[0]).toBeGreaterThan(sellerDocument.create.mock.invocationCallOrder[0]);
    expect(row.uploadedAt).toBeNull();
  });

  it('images get an extension-less public_id under the private folder', async () => {
    const { service, sellerDocument } = make();
    await service.createAndUpload({ sellerProfileId: PROFILE, type: SellerDocumentType.IDENTITY_DOCUMENT, label: null, file: file({ buffer: PNG, size: PNG.length, mimetype: 'image/png', originalname: 'cni.png' }) });
    const data = sellerDocument.create.mock.calls[0][0].data;
    expect(data.cloudinaryId).toBe(`${SELLER_DOCUMENTS_FOLDER}/${PROFILE}/${data.id}`);
    expect(data.resourceType).toBe('image');
  });

  it('a failed upload deletes the row and rethrows (no orphan DB row)', async () => {
    const { service, sellerDocument, cloudinary } = make();
    cloudinary.uploadPrivateDocument.mockRejectedValue(new BadRequestException('Échec du téléchargement du document'));
    await expect(service.createAndUpload({ sellerProfileId: PROFILE, type: SellerDocumentType.RCCM, label: null, file: file({}) })).rejects.toThrow('Échec du téléchargement');
    const id = sellerDocument.create.mock.calls[0][0].data.id;
    expect(sellerDocument.delete).toHaveBeenCalledWith({ where: { id } });
  });

  it('discard() destroys the asset with its type and removes the row; keeps the row when Cloudinary cannot confirm', async () => {
    const { service, sellerDocument, cloudinary } = make();
    await service.discard({ id: 'd1', cloudinaryId: 'teka-rdc/seller-documents/p/d1.pdf', resourceType: 'raw' });
    expect(cloudinary.deletePrivateAsset).toHaveBeenCalledWith('teka-rdc/seller-documents/p/d1.pdf', 'raw');
    expect(sellerDocument.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    cloudinary.deletePrivateAsset.mockResolvedValue(false);
    sellerDocument.delete.mockClear();
    await service.discard({ id: 'd2', cloudinaryId: 'x', resourceType: 'image' });
    expect(sellerDocument.delete).not.toHaveBeenCalled();
  });
});

describe('SellerDocumentStorageService — access links and retention (D7/D8)', () => {
  it('downloadUrl uses the expiry-enforced private download link with the configured TTL and the right format', () => {
    const { service, cloudinary } = make();
    const r = service.downloadUrl({ cloudinaryId: 'c', resourceType: 'image', mimeType: 'image/png' });
    expect(cloudinary.getPrivateDownloadUrl).toHaveBeenCalledWith('c', { resourceType: 'image', format: 'png', expiresInSeconds: 120 });
    expect(r.expiresInSeconds).toBe(120);
    service.downloadUrl({ cloudinaryId: 'c.pdf', resourceType: 'raw', mimeType: 'application/pdf' });
    expect(cloudinary.getPrivateDownloadUrl).toHaveBeenLastCalledWith('c.pdf', { resourceType: 'raw', format: undefined, expiresInSeconds: 120 });
  });

  it('retentionDeadline is now + SELLER_DOCUMENT_RETENTION_DAYS', () => {
    const { service } = make();
    const from = new Date('2026-09-05T00:00:00Z');
    expect(service.retentionDeadline(from).toISOString()).toBe('2026-12-04T00:00:00.000Z');
  });

  it('purgeBinary destroys with the right type and stamps purgedAt; idempotent; leaves the row when Cloudinary fails', async () => {
    const { service, sellerDocument, cloudinary } = make();
    await expect(service.purgeBinary({ id: 'd', cloudinaryId: 'c.pdf', resourceType: 'raw', purgedAt: null })).resolves.toBe(true);
    expect(cloudinary.deletePrivateAsset).toHaveBeenCalledWith('c.pdf', 'raw');
    expect(sellerDocument.update).toHaveBeenCalledWith({ where: { id: 'd' }, data: { purgedAt: expect.any(Date) } });
    cloudinary.deletePrivateAsset.mockClear();
    await expect(service.purgeBinary({ id: 'd', cloudinaryId: 'c.pdf', resourceType: 'raw', purgedAt: new Date() })).resolves.toBe(true);
    expect(cloudinary.deletePrivateAsset).not.toHaveBeenCalled();
    cloudinary.deletePrivateAsset.mockResolvedValue(false);
    sellerDocument.update.mockClear();
    await expect(service.purgeBinary({ id: 'e', cloudinaryId: 'z', resourceType: 'image', purgedAt: null })).resolves.toBe(false);
    expect(sellerDocument.update).not.toHaveBeenCalled();
  });

  it('purgeAllForSeller purges every binary and schedules a retry for failures', async () => {
    const { service, sellerDocument, cloudinary } = make();
    sellerDocument.findMany.mockResolvedValue([
      { id: 'a', cloudinaryId: 'a', resourceType: 'image', purgedAt: null },
      { id: 'b', cloudinaryId: 'b.pdf', resourceType: 'raw', purgedAt: null },
    ]);
    cloudinary.deletePrivateAsset.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.purgeAllForSeller(PROFILE)).resolves.toEqual({ purged: 1, failed: 1 });
    expect(sellerDocument.update).toHaveBeenCalledWith({ where: { id: 'b' }, data: { purgeAfter: expect.any(Date) } });
  });

  it('retentionSweep purges due binaries and reconciles never-uploaded rows (asset destroyed, row removed)', async () => {
    const { service, sellerDocument, cloudinary } = make();
    sellerDocument.findMany
      .mockResolvedValueOnce([{ id: 'due', cloudinaryId: 'due.pdf', resourceType: 'raw', purgedAt: null }])
      .mockResolvedValueOnce([{ id: 'orphan', cloudinaryId: 'orphan', resourceType: 'image' }]);
    await expect(service.retentionSweep()).resolves.toEqual({ purged: 1, reconciled: 1 });
    expect(sellerDocument.findMany.mock.calls[0][0].where).toMatchObject({ purgedAt: null, uploadedAt: { not: null }, purgeAfter: { lte: expect.any(Date) } });
    expect(sellerDocument.findMany.mock.calls[1][0].where).toMatchObject({ uploadedAt: null, createdAt: { lt: expect.any(Date) } });
    expect(cloudinary.deletePrivateAsset).toHaveBeenCalledWith('orphan', 'image');
    expect(sellerDocument.delete).toHaveBeenCalledWith({ where: { id: 'orphan' } });
  });
});
