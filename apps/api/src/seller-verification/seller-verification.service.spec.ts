import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { SellerDocumentStatus, SellerDocumentType, SellerVerificationStatus } from '@prisma/client';
import { SellerVerificationService, toSellerDocumentView } from './seller-verification.service';

const USER = '10000000-0000-0000-0000-000000000001';
const OTHER_USER = '10000000-0000-0000-0000-000000000002';
const PROFILE = '50000000-0000-0000-0000-000000000001';
const ADMIN = '10000000-0000-0000-0000-00000000admin'.slice(0, 36);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n', 'latin1');
const file = () => ({ buffer: PDF, size: PDF.length, mimetype: 'application/pdf', originalname: 'rccm.pdf' }) as Express.Multer.File;

const profileRow = (over: Record<string, unknown> = {}) => ({
  id: PROFILE,
  userId: USER,
  businessName: 'Boutique QA',
  businessType: 'individual',
  verificationStatus: SellerVerificationStatus.NOT_SUBMITTED,
  verificationSubmittedAt: null,
  verifiedAt: null,
  verifiedById: null,
  verificationRejectedAt: null,
  verificationRevokedAt: null,
  verificationNote: null,
  ...over,
});
const docRow = (over: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  sellerProfileId: PROFILE,
  type: SellerDocumentType.IDENTITY_DOCUMENT,
  label: null,
  cloudinaryId: 'teka-rdc/seller-documents/p/doc-1',
  resourceType: 'image',
  mimeType: 'image/png',
  sizeBytes: 100,
  originalName: 'cni.png',
  status: SellerDocumentStatus.PENDING,
  rejectionReason: null,
  submittedAt: new Date('2026-09-05T10:00:00Z'),
  uploadedAt: new Date('2026-09-05T10:00:01Z'),
  reviewedAt: null,
  reviewedById: null,
  supersededAt: null,
  supersededById: null,
  purgeAfter: null,
  purgedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function make(opts: { profile?: Record<string, unknown> | null; docs?: any[]; previous?: any[]; liveAfter?: any[] } = {}) {
  const profile = opts.profile === null ? null : profileRow(opts.profile);
  const sellerProfile = {
    findFirst: jest.fn().mockResolvedValue(profile),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const sellerDocument = {
    findMany: jest.fn().mockResolvedValue(opts.docs ?? []),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const tx = { sellerProfile, sellerDocument };
  const prisma = { sellerProfile, sellerDocument, $transaction: jest.fn((cb: any) => cb(tx)) };
  const storage = {
    createAndUpload: jest.fn().mockResolvedValue(docRow({ type: SellerDocumentType.RCCM, mimeType: 'application/pdf', resourceType: 'raw', uploadedAt: null })),
    discard: jest.fn().mockResolvedValue(undefined),
    retentionDeadline: jest.fn().mockReturnValue(new Date('2026-12-04T00:00:00Z')),
    downloadUrl: jest.fn().mockReturnValue({ url: 'https://api.cloudinary.example/download?sig=1', expiresInSeconds: 120 }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined), listForEntity: jest.fn().mockResolvedValue([{ action: 'SELLER_DOCUMENT_SUBMITTED' }, { action: 'PAYOUT_APPROVED' }]) };
  const notifications = { notifyVerification: jest.fn().mockResolvedValue(undefined) };
  const service = new SellerVerificationService(prisma as never, storage as never, audit as never, notifications as never);
  return { service, prisma, sellerProfile, sellerDocument, storage, audit, notifications };
}

describe('SellerVerificationService.getOwnStatus', () => {
  it('a legacy seller is NOT_SUBMITTED with the individual requirement missing, and never sees storage ids', async () => {
    const { service, sellerProfile } = make();
    const res = await service.getOwnStatus(USER);
    expect(sellerProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: USER, deletedAt: null } }));
    expect(res.verificationStatus).toBe('NOT_SUBMITTED');
    expect(res.requiredTypes).toEqual(['IDENTITY_DOCUMENT']);
    expect(res.missingTypes).toEqual(['IDENTITY_DOCUMENT']);
    expect(JSON.stringify(res)).not.toContain('cloudinary');
  });

  it('a company needs RCCM + Identification Nationale + identity document; documents are views without cloudinaryId', async () => {
    const { service } = make({ profile: { businessType: 'company' }, docs: [docRow({ type: SellerDocumentType.RCCM })] });
    const res = await service.getOwnStatus(USER);
    expect(res.requiredTypes).toEqual(['RCCM', 'IDENTIFICATION_NATIONALE', 'IDENTITY_DOCUMENT']);
    expect(res.missingTypes).toEqual(['IDENTIFICATION_NATIONALE', 'IDENTITY_DOCUMENT']);
    expect(Object.keys(res.documents[0]).sort()).toEqual(['id', 'label', 'mimeType', 'originalName', 'rejectionReason', 'reviewedAt', 'sizeBytes', 'status', 'submittedAt', 'type'].sort());
    expect(JSON.stringify(res)).not.toMatch(/cloudinaryId|resourceType|purge/);
  });

  it('404s when the caller has no seller profile', async () => {
    const { service } = make({ profile: null });
    await expect(service.getOwnStatus(OTHER_USER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows the admin note only while REJECTED', async () => {
    const { service } = make({ profile: { verificationStatus: 'VERIFIED', verificationNote: 'ok' } });
    expect((await service.getOwnStatus(USER)).verificationNote).toBeNull();
    const rejected = make({ profile: { verificationStatus: 'REJECTED', verificationNote: 'Illisible' } });
    expect((await rejected.service.getOwnStatus(USER)).verificationNote).toBe('Illisible');
  });
});

describe('SellerVerificationService.submitDocument — ownership, supersede, status rule, failure isolation', () => {
  it('uploads for the caller\'s own profile only and moves NOT_SUBMITTED → PENDING_REVIEW once the set is complete', async () => {
    const { service, storage, sellerProfile, sellerDocument, audit, notifications } = make();
    sellerDocument.findMany
      .mockResolvedValueOnce([]) // previous of same type
      .mockResolvedValueOnce([{ type: SellerDocumentType.IDENTITY_DOCUMENT }]) // live after
      .mockResolvedValueOnce([docRow()]); // getOwnStatus
    await service.submitDocument(USER, { type: SellerDocumentType.IDENTITY_DOCUMENT }, file());
    expect(storage.createAndUpload).toHaveBeenCalledWith(expect.objectContaining({ sellerProfileId: PROFILE, type: 'IDENTITY_DOCUMENT' }));
    expect(sellerDocument.update).toHaveBeenCalledWith({ where: { id: 'doc-1' }, data: { uploadedAt: expect.any(Date) } });
    expect(sellerProfile.update).toHaveBeenCalledWith({ where: { id: PROFILE }, data: { verificationStatus: 'PENDING_REVIEW', verificationSubmittedAt: expect.any(Date) } });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorId: USER, action: 'SELLER_DOCUMENT_SUBMITTED', entityType: 'seller_profile', entityId: PROFILE }));
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'SELLER_VERIFICATION_SUBMITTED', before: { verificationStatus: 'NOT_SUBMITTED' }, after: { verificationStatus: 'PENDING_REVIEW' } }));
    expect(notifications.notifyVerification).toHaveBeenCalledWith(USER, 'submitted');
  });

  it('stays NOT_SUBMITTED while required documents are missing (company with only an RCCM)', async () => {
    const { service, sellerProfile, sellerDocument, notifications } = make({ profile: { businessType: 'company' } });
    sellerDocument.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ type: SellerDocumentType.RCCM }]).mockResolvedValueOnce([]);
    await service.submitDocument(USER, { type: SellerDocumentType.RCCM }, file());
    expect(sellerProfile.update).not.toHaveBeenCalled();
    expect(notifications.notifyVerification).not.toHaveBeenCalled();
  });

  it('a seller can never reach VERIFIED through an upload, and cannot name another seller', async () => {
    const { service, sellerProfile, sellerDocument } = make({ profile: { verificationStatus: 'PENDING_REVIEW' } });
    sellerDocument.findMany.mockResolvedValue([]);
    await service.submitDocument(USER, { type: SellerDocumentType.IDENTITY_DOCUMENT }, file());
    for (const call of sellerProfile.update.mock.calls) {
      expect(call[0].data.verificationStatus).not.toBe('VERIFIED');
    }
    // The profile is resolved from the JWT user id; there is no parameter to spoof.
    expect(sellerProfile.findFirst.mock.calls[0][0].where).toEqual({ userId: USER, deletedAt: null });
  });

  it('replacing a document supersedes the previous ones with the retention clock started, audited as REPLACED', async () => {
    const { service, sellerDocument, audit } = make();
    sellerDocument.findMany
      .mockResolvedValueOnce([{ id: 'old-1', status: 'PENDING' }, { id: 'old-2', status: 'REJECTED' }])
      .mockResolvedValueOnce([{ type: SellerDocumentType.IDENTITY_DOCUMENT }])
      .mockResolvedValueOnce([]);
    await service.submitDocument(USER, { type: SellerDocumentType.IDENTITY_DOCUMENT }, file());
    expect(sellerDocument.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
      data: { status: 'SUPERSEDED', supersededAt: expect.any(Date), supersededById: 'doc-1', purgeAfter: new Date('2026-12-04T00:00:00Z') },
    });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'SELLER_DOCUMENT_REPLACED', after: expect.objectContaining({ replaced: ['old-1', 'old-2'] }) }));
  });

  it('a VERIFIED seller replacing MATERIAL evidence goes back to PENDING_REVIEW (D5); replacing OTHER does not', async () => {
    const material = make({ profile: { verificationStatus: 'VERIFIED' } });
    material.sellerDocument.findMany.mockResolvedValueOnce([{ id: 'acc', status: 'ACCEPTED' }]).mockResolvedValueOnce([{ type: 'IDENTITY_DOCUMENT' }]).mockResolvedValueOnce([]);
    await material.service.submitDocument(USER, { type: SellerDocumentType.IDENTITY_DOCUMENT }, file());
    expect(material.sellerProfile.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verificationStatus: 'PENDING_REVIEW' }) }));

    const other = make({ profile: { verificationStatus: 'VERIFIED' } });
    other.sellerDocument.findMany.mockResolvedValueOnce([{ id: 'acc', status: 'ACCEPTED' }]).mockResolvedValueOnce([{ type: 'IDENTITY_DOCUMENT' }]).mockResolvedValueOnce([]);
    await other.service.submitDocument(USER, { type: SellerDocumentType.OTHER, label: 'Patente' }, file());
    expect(other.sellerProfile.update).not.toHaveBeenCalled();
  });

  it('OTHER requires a label; the label is trimmed', async () => {
    const { service, storage } = make();
    await expect(service.submitDocument(USER, { type: SellerDocumentType.OTHER, label: '  ' }, file())).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.createAndUpload).not.toHaveBeenCalled();
  });

  it('a failed domain write after a successful upload discards the asset and row, then rethrows', async () => {
    const { service, sellerDocument, storage } = make();
    sellerDocument.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(service.submitDocument(USER, { type: SellerDocumentType.IDENTITY_DOCUMENT }, file())).rejects.toThrow('db down');
    expect(storage.discard).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }));
  });

  it('a failing notification never affects the committed result', async () => {
    const { service, sellerDocument, notifications } = make();
    sellerDocument.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ type: 'IDENTITY_DOCUMENT' }]).mockResolvedValueOnce([]);
    notifications.notifyVerification.mockRejectedValue(new Error('push down'));
    await expect(service.submitDocument(USER, { type: SellerDocumentType.IDENTITY_DOCUMENT }, file())).resolves.toBeDefined();
  });
});

describe('SellerVerificationService — admin transitions', () => {
  it('approve: PENDING_REVIEW → VERIFIED, pending documents ACCEPTED, audit + notification', async () => {
    const { service, sellerProfile, sellerDocument, audit, notifications } = make({ profile: { verificationStatus: 'PENDING_REVIEW' } });
    await service.approve(ADMIN, PROFILE);
    expect(sellerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: PROFILE, deletedAt: null, verificationStatus: { in: ['PENDING_REVIEW', 'REJECTED'] } },
      data: { verificationStatus: 'VERIFIED', verifiedAt: expect.any(Date), verifiedById: ADMIN, verificationNote: null },
    });
    expect(sellerDocument.updateMany).toHaveBeenCalledWith({ where: { sellerProfileId: PROFILE, status: 'PENDING' }, data: { status: 'ACCEPTED', reviewedAt: expect.any(Date), reviewedById: ADMIN } });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorId: ADMIN, action: 'SELLER_VERIFICATION_APPROVED', before: { verificationStatus: 'PENDING_REVIEW' }, after: { verificationStatus: 'VERIFIED' } }));
    expect(notifications.notifyVerification).toHaveBeenCalledWith(USER, 'verified', undefined);
  });

  it('a stale transition is refused with 409 and writes nothing else', async () => {
    const { service, sellerProfile, audit } = make({ profile: { verificationStatus: 'NOT_SUBMITTED' } });
    sellerProfile.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.approve(ADMIN, PROFILE)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('reject requires a reason; pending documents are REJECTED with the retention clock', async () => {
    const { service, sellerDocument } = make({ profile: { verificationStatus: 'PENDING_REVIEW' } });
    await expect(service.reject(ADMIN, PROFILE, '')).rejects.toBeInstanceOf(BadRequestException);
    await service.reject(ADMIN, PROFILE, 'Document illisible');
    expect(sellerDocument.updateMany).toHaveBeenCalledWith({
      where: { sellerProfileId: PROFILE, status: 'PENDING' },
      data: { status: 'REJECTED', rejectionReason: 'Document illisible', reviewedAt: expect.any(Date), reviewedById: ADMIN, purgeAfter: new Date('2026-12-04T00:00:00Z') },
    });
  });

  it('revoke: VERIFIED → REJECTED with verificationRevokedAt, evidence untouched, account untouched', async () => {
    const { service, sellerProfile, sellerDocument, notifications } = make({ profile: { verificationStatus: 'VERIFIED' } });
    await service.revoke(ADMIN, PROFILE, 'Documents expirés');
    expect(sellerProfile.updateMany).toHaveBeenCalledWith({
      where: { id: PROFILE, deletedAt: null, verificationStatus: { in: ['VERIFIED'] } },
      data: { verificationStatus: 'REJECTED', verificationRevokedAt: expect.any(Date), verificationNote: 'Documents expirés' },
    });
    expect(sellerDocument.updateMany).not.toHaveBeenCalled();
    for (const c of sellerProfile.updateMany.mock.calls) expect(Object.keys(c[0].data)).not.toContain('applicationStatus');
    expect(notifications.notifyVerification).toHaveBeenCalledWith(USER, 'revoked', 'Documents expirés');
  });
});

describe('SellerVerificationService — admin document access', () => {
  it('issues a short-lived link only for a document of THAT seller, and audits the view', async () => {
    const { service, sellerDocument, storage, audit } = make();
    sellerDocument.findFirst.mockResolvedValue(docRow());
    const res = await service.documentAccessUrl(ADMIN, PROFILE, 'doc-1');
    expect(sellerDocument.findFirst).toHaveBeenCalledWith({ where: { id: 'doc-1', sellerProfileId: PROFILE } });
    expect(storage.downloadUrl).toHaveBeenCalled();
    expect(res).toEqual({ url: 'https://api.cloudinary.example/download?sig=1', expiresInSeconds: 120, mimeType: 'image/png', originalName: 'cni.png' });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actorId: ADMIN, action: 'SELLER_DOCUMENT_VIEWED', entityId: PROFILE }));
  });

  it('404 for another seller\'s document or a never-uploaded one; 410 once purged', async () => {
    const { service, sellerDocument, audit } = make();
    sellerDocument.findFirst.mockResolvedValueOnce(null);
    await expect(service.documentAccessUrl(ADMIN, PROFILE, 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    sellerDocument.findFirst.mockResolvedValueOnce(docRow({ uploadedAt: null }));
    await expect(service.documentAccessUrl(ADMIN, PROFILE, 'doc-1')).rejects.toBeInstanceOf(NotFoundException);
    sellerDocument.findFirst.mockResolvedValueOnce(docRow({ purgedAt: new Date() }));
    await expect(service.documentAccessUrl(ADMIN, PROFILE, 'doc-1')).rejects.toBeInstanceOf(GoneException);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('getForAdmin returns every document with retention stamps, the SELLER_* history, and no storage id', async () => {
    const { service } = make({ docs: [docRow({ status: 'SUPERSEDED', purgeAfter: new Date() })] });
    const res = await service.getForAdmin(PROFILE);
    expect(res.documents[0]).toMatchObject({ status: 'SUPERSEDED', purgeAfter: expect.any(Date) });
    expect(res.history).toEqual([{ action: 'SELLER_DOCUMENT_SUBMITTED' }]);
    expect(JSON.stringify(res)).not.toMatch(/cloudinaryId|resourceType|https?:/);
  });
});

describe('toSellerDocumentView', () => {
  it('is an allow-list, not a strip-list', () => {
    const view = toSellerDocumentView({ ...docRow(), extraLeak: 'x' } as never);
    expect(Object.keys(view)).toEqual(['id', 'type', 'label', 'status', 'mimeType', 'sizeBytes', 'originalName', 'submittedAt', 'reviewedAt', 'rejectionReason']);
  });
});
