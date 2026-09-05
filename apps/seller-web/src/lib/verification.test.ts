import { describe, expect, it } from 'vitest';
import {
  currentDocument,
  DOCUMENT_TYPE_UI,
  optionalDocumentTypes,
  replacementNeedsWarning,
  sniffDocumentMime,
  validateDocument,
  VERIFICATION_STATUS_UI,
  verificationStatusUi,
  type SellerDocumentView,
} from './verification';
import { hrefForNotification } from './payout-notifications';

const doc = (over: Partial<SellerDocumentView>): SellerDocumentView => ({
  id: 'd', type: 'IDENTITY_DOCUMENT', label: null, status: 'PENDING', mimeType: 'image/jpeg', sizeBytes: 1,
  originalName: null, submittedAt: '2026-09-05T10:00:00Z', reviewedAt: null, rejectionReason: null, ...over,
});

describe('verification vocabulary — natural French, no enum names, no over-claim', () => {
  it('four states + unknown → Non vérifié', () => {
    expect(verificationStatusUi('VERIFIED').label).toBe('Vérifié');
    expect(verificationStatusUi('PENDING_REVIEW').label).toBe('En attente de vérification');
    expect(verificationStatusUi('REJECTED').label).toBe('Vérification refusée');
    expect(verificationStatusUi('garbage').label).toBe('Non vérifié');
    for (const s of Object.values(VERIFICATION_STATUS_UI)) {
      expect(s.hint).not.toMatch(/gouvernement|garanti|certifi|_/i);
    }
    expect(VERIFICATION_STATUS_UI.VERIFIED.hint).toContain('uniquement que Teka a examiné');
    expect(VERIFICATION_STATUS_UI.REJECTED.hint).toContain('reste active');
    expect(DOCUMENT_TYPE_UI.IDENTITY_DOCUMENT.label).toBe("Pièce d'identité");
  });
});

describe('requirements come from the API', () => {
  it('only « Autre » is optional; current document skips superseded rows', () => {
    expect(optionalDocumentTypes(['IDENTITY_DOCUMENT'])).toEqual(['OTHER']);
    expect(optionalDocumentTypes(['RCCM', 'IDENTIFICATION_NATIONALE', 'IDENTITY_DOCUMENT'])).toEqual(['OTHER']);
    const docs = [doc({ id: 'old', type: 'RCCM', status: 'SUPERSEDED' }), doc({ id: 'new', type: 'RCCM' })];
    expect(currentDocument(docs, 'RCCM')?.id).toBe('new');
    expect(currentDocument(docs, 'OTHER')).toBeNull();
  });

  it('warns only when a VERIFIED seller replaces required evidence (D5)', () => {
    const base = { requiredTypes: ['IDENTITY_DOCUMENT'] as const, documents: [doc({})] };
    expect(replacementNeedsWarning({ ...base, verificationStatus: 'VERIFIED', requiredTypes: [...base.requiredTypes] }, 'IDENTITY_DOCUMENT')).toBe(true);
    expect(replacementNeedsWarning({ ...base, verificationStatus: 'VERIFIED', requiredTypes: [...base.requiredTypes] }, 'OTHER')).toBe(false);
    expect(replacementNeedsWarning({ ...base, verificationStatus: 'PENDING_REVIEW', requiredTypes: [...base.requiredTypes] }, 'IDENTITY_DOCUMENT')).toBe(false);
  });
});

describe('client pre-check mirrors the API', () => {
  const limits = { maxSizeBytes: 5 * 1024 * 1024, acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'] };
  const pdf = new TextEncoder().encode('%PDF-1.4\n');
  it('sniffs PDF/JPEG/PNG, refuses the rest, enforces the server size', () => {
    expect(sniffDocumentMime(pdf)).toBe('application/pdf');
    expect(sniffDocumentMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffDocumentMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('image/png');
    expect(sniffDocumentMime(new TextEncoder().encode('MZ......'))).toBeNull();
    expect(validateDocument({ size: 10 }, pdf, limits)).toBeNull();
    expect(validateDocument({ size: 6 * 1024 * 1024 }, pdf, limits)).toBe('Le fichier dépasse 5 Mo.');
    expect(validateDocument({ size: 10 }, new TextEncoder().encode('<svg/>'), limits)).toBe('Format non supporté. Formats acceptés : PDF, JPEG, PNG.');
    expect(validateDocument({ size: 0 }, pdf, limits)).toBe('Le fichier est vide.');
  });
});

describe('verification notifications deep-link to the verification page', () => {
  it('by type or entityType, ignoring the entity id', () => {
    expect(hrefForNotification({ type: 'SELLER_VERIFICATION', entityType: 'seller_verification', entityId: 'x' })).toBe('/dashboard/verification');
    expect(hrefForNotification({ type: 'SELLER_VERIFICATION', entityType: null, entityId: null })).toBe('/dashboard/verification');
  });
});
