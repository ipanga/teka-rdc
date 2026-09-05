/**
 * Admin « Vérification vendeur » — pure mapping and copy for the seller list
 * column/filter, the review card and the audit timeline. The API
 * (`/v1/admin/sellers/:id/verification`) owns every rule: which transitions
 * are possible comes from its `actions` field, which documents are required
 * from `requiredTypes` / `missingTypes`. Nothing here re-encodes them.
 */

export type SellerVerificationStatus = 'NOT_SUBMITTED' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
export type SellerDocumentType = 'RCCM' | 'IDENTIFICATION_NATIONALE' | 'IDENTITY_DOCUMENT' | 'OTHER';
export type SellerDocumentStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'SUPERSEDED';
export type AdminVerificationAction = 'approve' | 'reject' | 'revoke';

export interface AdminVerificationDocument {
  id: string;
  type: SellerDocumentType;
  label: string | null;
  status: SellerDocumentStatus;
  mimeType: string;
  sizeBytes: number;
  originalName: string | null;
  submittedAt: string;
  uploadedAt: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  rejectionReason: string | null;
  supersededAt: string | null;
  supersededById: string | null;
  purgeAfter: string | null;
  purgedAt: string | null;
}

export interface HistoryActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface VerificationHistoryEntry {
  id: string;
  action: string;
  createdAt: string;
  reason: string | null;
  actor: HistoryActor | null;
  fromStatus: string | null;
  toStatus: string | null;
  documentType: string | null;
}

export interface AdminVerificationView {
  sellerProfileId: string;
  businessName: string;
  businessType: string | null;
  verificationStatus: SellerVerificationStatus;
  verificationSubmittedAt: string | null;
  verifiedAt: string | null;
  verifiedById: string | null;
  verificationRejectedAt: string | null;
  verificationRevokedAt: string | null;
  verificationNote: string | null;
  requiredTypes: SellerDocumentType[];
  missingTypes: SellerDocumentType[];
  actions: Record<AdminVerificationAction, boolean>;
  documents: AdminVerificationDocument[];
  history: VerificationHistoryEntry[];
}

/** Short-lived download link as issued by `documents/:id/url`. */
export interface DocumentLink {
  url: string;
  expiresInSeconds: number;
  mimeType: string;
  originalName: string | null;
}

export const VERIFICATION_FILTERS = ['NOT_SUBMITTED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const;

/** Short labels for the seller list column and filter (operationally dense). */
export const VERIFICATION_STATUS_UI: Record<SellerVerificationStatus, { label: string; tone: string; hint: string }> = {
  NOT_SUBMITTED: {
    label: 'Non soumis',
    tone: 'bg-muted text-muted-foreground',
    hint: 'Le vendeur n’a pas encore fourni tous les documents requis. Aucune action possible tant que le dossier est incomplet.',
  },
  PENDING_REVIEW: {
    label: 'En attente',
    tone: 'bg-warning/10 text-warning',
    hint: 'Dossier complet : les documents attendent votre examen. Vérifiez chaque pièce avant de décider.',
  },
  VERIFIED: {
    label: 'Vérifié',
    tone: 'bg-success/10 text-success',
    hint: 'Les documents ont été examinés et acceptés. La boutique porte le badge « Vérifié ».',
  },
  REJECTED: {
    label: 'Refusé',
    tone: 'bg-destructive/10 text-destructive',
    hint: 'Vérification refusée ou révoquée. Le compte vendeur reste actif ; le vendeur peut soumettre de nouveaux documents.',
  },
};

export function verificationStatusUi(status: string | null | undefined) {
  return VERIFICATION_STATUS_UI[(status ?? 'NOT_SUBMITTED') as SellerVerificationStatus] ?? VERIFICATION_STATUS_UI.NOT_SUBMITTED;
}

export const DOCUMENT_TYPE_LABELS: Record<SellerDocumentType, string> = {
  RCCM: 'RCCM',
  IDENTIFICATION_NATIONALE: 'Identification Nationale',
  IDENTITY_DOCUMENT: 'Pièce d’identité',
  OTHER: 'Autre document',
};

export function documentTypeLabel(type: string | null | undefined): string {
  return DOCUMENT_TYPE_LABELS[type as SellerDocumentType] ?? (type ?? 'Document');
}

export function documentTitle(doc: Pick<AdminVerificationDocument, 'type' | 'label'>): string {
  const base = documentTypeLabel(doc.type);
  return doc.type === 'OTHER' && doc.label ? `${base} — ${doc.label}` : base;
}

export const DOCUMENT_STATUS_UI: Record<SellerDocumentStatus, { label: string; tone: string }> = {
  PENDING: { label: 'À examiner', tone: 'bg-warning/10 text-warning' },
  ACCEPTED: { label: 'Accepté', tone: 'bg-success/10 text-success' },
  REJECTED: { label: 'Refusé', tone: 'bg-destructive/10 text-destructive' },
  SUPERSEDED: { label: 'Remplacé', tone: 'bg-muted text-muted-foreground' },
};

/** The documents an admin still has to look at: live rows only (never the superseded/purged history). */
export function isLiveDocument(doc: Pick<AdminVerificationDocument, 'status' | 'purgedAt'>): boolean {
  return (doc.status === 'PENDING' || doc.status === 'ACCEPTED') && !doc.purgedAt;
}

/** A document can be opened only while its binary still exists. */
export function isDocumentViewable(doc: Pick<AdminVerificationDocument, 'uploadedAt' | 'purgedAt'>): boolean {
  return !!doc.uploadedAt && !doc.purgedAt;
}

export function formatMime(mime: string): string {
  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'image/jpeg') return 'JPEG';
  if (mime === 'image/png') return 'PNG';
  return mime;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

export const HISTORY_ACTION_LABELS: Record<string, string> = {
  SELLER_DOCUMENT_SUBMITTED: 'Document soumis',
  SELLER_DOCUMENT_REPLACED: 'Document remplacé',
  SELLER_DOCUMENT_VIEWED: 'Document consulté',
  SELLER_VERIFICATION_SUBMITTED: 'Dossier complet — vérification demandée',
  SELLER_VERIFICATION_APPROVED: 'Vérification approuvée',
  SELLER_VERIFICATION_REJECTED: 'Vérification refusée',
  SELLER_VERIFICATION_REVOKED: 'Vérification révoquée',
};

export function actorName(actor: HistoryActor | null): string {
  if (!actor) return 'Inconnu';
  const name = `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim();
  if (actor.role === 'SELLER') return name ? `${name} (vendeur)` : 'Le vendeur';
  if (actor.role === 'SUPPORT') return name ? `${name} (support)` : 'Support';
  return name || 'Administrateur';
}

/** Title + optional detail line for one timeline row. */
export function describeHistory(entry: VerificationHistoryEntry): { title: string; detail: string | null } {
  const base = HISTORY_ACTION_LABELS[entry.action] ?? entry.action;
  const title = entry.documentType ? `${base} · ${documentTypeLabel(entry.documentType)}` : base;
  const parts: string[] = [];
  if (entry.fromStatus && entry.toStatus && entry.fromStatus !== entry.toStatus) {
    parts.push(`${verificationStatusUi(entry.fromStatus).label} → ${verificationStatusUi(entry.toStatus).label}`);
  }
  // An approval's "reason" is the admin's internal note (never sent to the seller); refusals/revocations carry the seller-facing motif.
  if (entry.reason) parts.push(`${entry.action === 'SELLER_VERIFICATION_APPROVED' ? 'Note interne' : 'Motif'} : ${entry.reason}`);
  return { title, detail: parts.length ? parts.join(' · ') : null };
}

/** Mirrors the API's ReviewVerificationDto bounds (5–500) for immediate feedback; the server stays authoritative. */
export const REASON_MIN = 5;
export const REASON_MAX = 500;
export function validateReason(text: string, required: boolean): string | null {
  const t = text.trim();
  if (!t) return required ? 'Indiquez un motif : il est transmis au vendeur.' : null;
  if (t.length < REASON_MIN) return `Le motif doit contenir au moins ${REASON_MIN} caractères.`;
  if (t.length > REASON_MAX) return `Le motif ne doit pas dépasser ${REASON_MAX} caractères.`;
  return null;
}

/** Copy for the three consequential dialogs — what the action does and does NOT do. */
export const ACTION_COPY: Record<AdminVerificationAction, { title: string; button: string; body: string; reasonLabel: string; reasonRequired: boolean; destructive: boolean }> = {
  approve: {
    title: 'Vérifier cette boutique ?',
    button: 'Vérifier',
    body: 'Les documents en attente sont marqués acceptés et la boutique obtient le badge « Vérifié ». Le vendeur est prévenu. Le badge signifie uniquement que Teka RDC a examiné ces documents.',
    reasonLabel: 'Note interne (facultative)',
    reasonRequired: false,
    destructive: false,
  },
  reject: {
    title: 'Refuser la vérification ?',
    button: 'Refuser',
    body: 'Les documents en attente sont refusés et le motif est affiché au vendeur, qui pourra soumettre de nouveaux documents. Le compte vendeur et ses produits ne sont pas suspendus.',
    reasonLabel: 'Motif du refus (transmis au vendeur)',
    reasonRequired: true,
    destructive: true,
  },
  revoke: {
    title: 'Révoquer la vérification ?',
    button: 'Révoquer la vérification',
    body: 'La boutique perd le badge « Vérifié » et le motif est affiché au vendeur. Les documents acceptés sont conservés. Cette action ne suspend PAS le compte vendeur : pour suspendre un compte, utilisez la gestion des utilisateurs.',
    reasonLabel: 'Motif de la révocation (transmis au vendeur)',
    reasonRequired: true,
    destructive: true,
  },
};

/** Label for the approve button: a re-review after a refusal/revocation reads differently. */
export function approveButtonLabel(status: SellerVerificationStatus): string {
  return status === 'REJECTED' ? 'Réexaminer et vérifier' : 'Vérifier';
}

/** When a 409 comes back, tell the admin what changed rather than just « conflit ». */
export function describeStateChange(before: SellerVerificationStatus, after: SellerVerificationStatus): string {
  if (before === after) {
    return 'L’action n’est plus possible dans l’état actuel du dossier (documents modifiés entre-temps). L’état affiché a été rechargé.';
  }
  return `L’état a changé entre-temps : ${VERIFICATION_STATUS_UI[before].label} → ${VERIFICATION_STATUS_UI[after].label}. L’état affiché a été rechargé ; vérifiez avant d’agir de nouveau.`;
}

/** Seconds of validity left for a link issued at `issuedAtMs`; never negative. */
export function linkSecondsLeft(issuedAtMs: number, expiresInSeconds: number, nowMs: number): number {
  return Math.max(0, Math.ceil((issuedAtMs + expiresInSeconds * 1000 - nowMs) / 1000));
}

/** French message for a failed link request, by HTTP status; never echoes the API URL. */
export function documentLinkError(status: number | null): string {
  switch (status) {
    case 403:
      return 'Accès refusé : seuls les administrateurs peuvent consulter les documents.';
    case 404:
      return 'Document introuvable : il n’a jamais été téléversé ou n’appartient pas à ce vendeur.';
    case 410:
      return 'Document supprimé : la durée de conservation est dépassée.';
    default:
      return 'Le lien de consultation n’a pas pu être généré. Réessayez.';
  }
}
