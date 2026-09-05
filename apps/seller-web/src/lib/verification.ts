/**
 * Seller verification presentation helpers — pure, no fetching. The API
 * (`GET /v1/sellers/verification`) is the source of truth: it returns the
 * status, the required document types for this seller (D3) and the upload
 * limits, so nothing here encodes a business rule. Vocabulary mirrors
 * seller-mobile `features/verification/presentation/verification_status.dart`.
 */

export type VerificationStatus = 'NOT_SUBMITTED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type SellerDocumentType = 'RCCM' | 'IDENTIFICATION_NATIONALE' | 'IDENTITY_DOCUMENT' | 'OTHER';
export type SellerDocumentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';

export interface SellerDocumentView {
  id: string;
  type: SellerDocumentType;
  label: string | null;
  status: SellerDocumentStatus;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  rejectionReason: string | null;
}

export interface VerificationStatusPayload {
  verificationStatus: VerificationStatus;
  verificationSubmittedAt: string | null;
  verifiedAt: string | null;
  verificationRejectedAt: string | null;
  verificationRevokedAt: string | null;
  verificationNote: string | null;
  businessType: string | null;
  requiredTypes: SellerDocumentType[];
  missingTypes: SellerDocumentType[];
  limits: { maxSizeBytes: number; acceptedMimeTypes: string[] };
  documents: SellerDocumentView[];
}

/** Natural French — no enum name reaches the seller, no over-claim (D5). */
export const VERIFICATION_STATUS_UI: Record<VerificationStatus, { label: string; hint: string; tone: string }> = {
  NOT_SUBMITTED: {
    label: 'Non vérifié',
    hint: 'Fournissez vos documents justificatifs pour que Teka RDC les examine et affiche le badge « Vérifié » sur vos fiches produits.',
    tone: 'bg-muted text-muted-foreground',
  },
  PENDING_REVIEW: {
    label: 'En attente de vérification',
    hint: "Teka RDC examine les documents que vous avez fournis. Vous serez informé du résultat ; aucune action n'est requise.",
    tone: 'bg-warning/10 text-warning',
  },
  VERIFIED: {
    label: 'Vérifié',
    hint: 'Teka RDC a examiné vos documents justificatifs. Le badge « Vérifié » apparaît sur vos fiches produits ; il signifie uniquement que Teka a examiné ces documents.',
    tone: 'bg-success/15 text-success',
  },
  REJECTED: {
    label: 'Vérification refusée',
    hint: "Vos documents n'ont pas pu être validés. Votre boutique reste active : soumettez de nouveaux documents pour une nouvelle vérification.",
    tone: 'bg-destructive/10 text-destructive',
  },
};

export function verificationStatusUi(status: string | null | undefined) {
  return VERIFICATION_STATUS_UI[(status as VerificationStatus) in VERIFICATION_STATUS_UI ? (status as VerificationStatus) : 'NOT_SUBMITTED'];
}

export const DOCUMENT_TYPE_UI: Record<SellerDocumentType, { label: string; hint: string }> = {
  RCCM: { label: 'RCCM', hint: "Registre du commerce et du crédit mobilier de l'entreprise." },
  IDENTIFICATION_NATIONALE: { label: 'Identification Nationale', hint: "Numéro d'identification nationale délivré à l'entreprise." },
  IDENTITY_DOCUMENT: { label: "Pièce d'identité", hint: "Carte d'électeur, passeport ou permis du responsable de la boutique." },
  OTHER: { label: 'Autre document officiel', hint: 'Patente, attestation ou tout autre justificatif utile (facultatif).' },
};

export const DOCUMENT_STATUS_UI: Record<SellerDocumentStatus, { label: string; tone: string }> = {
  PENDING: { label: 'En cours de vérification', tone: 'text-warning' },
  ACCEPTED: { label: 'Accepté', tone: 'text-success' },
  REJECTED: { label: 'Refusé', tone: 'text-destructive' },
  SUPERSEDED: { label: 'Remplacé', tone: 'text-muted-foreground' },
};

/** Only « Autre document » is offered beyond the API's required set (D3). */
export function optionalDocumentTypes(requiredTypes: readonly SellerDocumentType[]): SellerDocumentType[] {
  return requiredTypes.includes('OTHER') ? [] : ['OTHER'];
}

/** The current (non-superseded) document of a type, if any. */
export function currentDocument(documents: readonly SellerDocumentView[], type: SellerDocumentType): SellerDocumentView | null {
  return documents.find((d) => d.type === type && d.status !== 'SUPERSEDED') ?? null;
}

/** A VERIFIED seller replacing required evidence goes back to review (D5) — warn first. */
export function replacementNeedsWarning(payload: Pick<VerificationStatusPayload, 'verificationStatus' | 'requiredTypes' | 'documents'>, type: SellerDocumentType): boolean {
  return payload.verificationStatus === 'VERIFIED' && payload.requiredTypes.includes(type) && currentDocument(payload.documents, type) !== null;
}

const MAGIC: Array<{ mime: string; test: (b: Uint8Array) => boolean }> = [
  { mime: 'application/pdf', test: (b) => b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d },
  { mime: 'image/jpeg', test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
];

/** Client-side mirror of the API's magic-byte rule (the API re-checks everything). */
export function sniffDocumentMime(head: Uint8Array): string | null {
  return MAGIC.find((m) => m.test(head))?.mime ?? null;
}

/** French pre-upload validation; null = OK. */
export function validateDocument(
  file: { size: number },
  head: Uint8Array,
  limits: { maxSizeBytes: number; acceptedMimeTypes: string[] },
): string | null {
  if (file.size === 0) return 'Le fichier est vide.';
  if (file.size > limits.maxSizeBytes) return `Le fichier dépasse ${Math.round(limits.maxSizeBytes / (1024 * 1024))} Mo.`;
  const mime = sniffDocumentMime(head);
  if (!mime || !limits.acceptedMimeTypes.includes(mime)) return 'Format non supporté. Formats acceptés : PDF, JPEG, PNG.';
  return null;
}

export function documentFileLabel(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType === 'image/png') return 'PNG';
  return 'JPEG';
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}

/** Where a verification notification takes the seller. */
export const VERIFICATION_HREF = '/dashboard/verification';
