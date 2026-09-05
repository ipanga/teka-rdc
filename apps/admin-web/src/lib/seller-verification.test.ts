import { describe, expect, it } from 'vitest';
import {
  ACTION_COPY,
  VERIFICATION_FILTERS,
  VERIFICATION_STATUS_UI,
  actorName,
  approveButtonLabel,
  describeHistory,
  describeStateChange,
  documentLinkError,
  documentTitle,
  formatFileSize,
  formatMime,
  isDocumentViewable,
  isLiveDocument,
  linkSecondsLeft,
  validateReason,
  verificationStatusUi,
  type VerificationHistoryEntry,
} from './seller-verification';

describe('status copy', () => {
  it('uses the four short admin labels and falls back to « Non soumis » for legacy/unknown', () => {
    expect(VERIFICATION_FILTERS.map((s) => VERIFICATION_STATUS_UI[s].label)).toEqual(['Non soumis', 'En attente', 'Vérifié', 'Refusé']);
    expect(verificationStatusUi(undefined).label).toBe('Non soumis');
    expect(verificationStatusUi('WEIRD').label).toBe('Non soumis');
  });

  it('never promises certification or suspension', () => {
    const all = [...Object.values(VERIFICATION_STATUS_UI).map((s) => s.hint), ...Object.values(ACTION_COPY).map((a) => a.body)].join(' ');
    expect(all).not.toMatch(/certifi|garanti|gouvernement/i);
    expect(ACTION_COPY.revoke.body).toMatch(/ne suspend PAS le compte/);
    expect(ACTION_COPY.reject.body).toMatch(/ne sont pas suspendus/);
  });
});

describe('documents', () => {
  it('titles OTHER with its label, formats size and mime', () => {
    expect(documentTitle({ type: 'RCCM', label: null })).toBe('RCCM');
    expect(documentTitle({ type: 'OTHER', label: 'Patente 2026' })).toBe('Autre document — Patente 2026');
    expect(formatFileSize(303)).toBe('303 o');
    expect(formatFileSize(4 * 1024)).toBe('4 Ko');
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1,5 Mo');
    expect(formatMime('application/pdf')).toBe('PDF');
    expect(formatMime('image/jpeg')).toBe('JPEG');
  });

  it('live = PENDING/ACCEPTED and not purged; viewable = uploaded and not purged', () => {
    expect(isLiveDocument({ status: 'PENDING', purgedAt: null })).toBe(true);
    expect(isLiveDocument({ status: 'SUPERSEDED', purgedAt: null })).toBe(false);
    expect(isLiveDocument({ status: 'ACCEPTED', purgedAt: '2026-12-01T00:00:00Z' })).toBe(false);
    expect(isDocumentViewable({ uploadedAt: '2026-09-05T10:00:00Z', purgedAt: null })).toBe(true);
    expect(isDocumentViewable({ uploadedAt: null, purgedAt: null })).toBe(false);
    expect(isDocumentViewable({ uploadedAt: '2026-09-05T10:00:00Z', purgedAt: '2026-12-05T10:00:00Z' })).toBe(false);
  });

  it('link errors are French and status-specific, without any URL', () => {
    expect(documentLinkError(404)).toMatch(/introuvable/);
    expect(documentLinkError(410)).toMatch(/supprimé/);
    expect(documentLinkError(403)).toMatch(/administrateurs/);
    expect(documentLinkError(500)).toMatch(/Réessayez/);
    for (const s of [403, 404, 410, 500, null]) expect(documentLinkError(s)).not.toMatch(/https?:/);
  });

  it('link countdown reaches 0 at expiry and never goes negative', () => {
    const issued = 1_000_000;
    expect(linkSecondsLeft(issued, 120, issued)).toBe(120);
    expect(linkSecondsLeft(issued, 120, issued + 119_500)).toBe(1);
    expect(linkSecondsLeft(issued, 120, issued + 120_000)).toBe(0);
    expect(linkSecondsLeft(issued, 120, issued + 500_000)).toBe(0);
  });
});

describe('actions', () => {
  it('reason bounds mirror the API DTO (5–500) and the requirement of the action', () => {
    expect(validateReason('', true)).toMatch(/motif/);
    expect(validateReason('', false)).toBeNull();
    expect(validateReason('abc', true)).toMatch(/5 caractères/);
    expect(validateReason('a'.repeat(501), false)).toMatch(/500/);
    expect(validateReason('Document illisible', true)).toBeNull();
  });

  it('approve reads as a re-review after a refusal', () => {
    expect(approveButtonLabel('PENDING_REVIEW')).toBe('Vérifier');
    expect(approveButtonLabel('REJECTED')).toBe('Réexaminer et vérifier');
  });

  it('explains a stale-state conflict in terms of what changed', () => {
    expect(describeStateChange('PENDING_REVIEW', 'VERIFIED')).toMatch(/En attente → Vérifié/);
    expect(describeStateChange('PENDING_REVIEW', 'PENDING_REVIEW')).toMatch(/plus possible/);
  });
});

describe('history', () => {
  const row = (over: Partial<VerificationHistoryEntry>): VerificationHistoryEntry => ({
    id: 'h1', action: 'SELLER_VERIFICATION_APPROVED', createdAt: '2026-09-05T10:00:00Z', reason: null, actor: null, fromStatus: null, toStatus: null, documentType: null, ...over,
  });

  it('labels every PR 2 action, adds the document type and the transition, and shows the reason', () => {
    expect(describeHistory(row({ action: 'SELLER_DOCUMENT_SUBMITTED', documentType: 'RCCM' }))).toEqual({ title: 'Document soumis · RCCM', detail: null });
    expect(describeHistory(row({ fromStatus: 'PENDING_REVIEW', toStatus: 'VERIFIED' }))).toEqual({ title: 'Vérification approuvée', detail: 'En attente → Vérifié' });
    expect(describeHistory(row({ action: 'SELLER_VERIFICATION_REVOKED', fromStatus: 'VERIFIED', toStatus: 'REJECTED', reason: 'Documents expirés' })).detail).toBe('Vérifié → Refusé · Motif : Documents expirés');
    expect(describeHistory(row({ action: 'SELLER_DOCUMENT_VIEWED', documentType: 'IDENTITY_DOCUMENT' })).title).toBe('Document consulté · Pièce d’identité');
    expect(describeHistory(row({ action: 'SOMETHING_NEW' })).title).toBe('SOMETHING_NEW');
    expect(describeHistory(row({ reason: 'Recontrôlé' })).detail).toBe('Note interne : Recontrôlé');
  });

  it('names actors by role without leaking ids', () => {
    expect(actorName(null)).toBe('Inconnu');
    expect(actorName({ id: 'u1', firstName: 'Ange', lastName: 'Kalala', role: 'ADMIN' })).toBe('Ange Kalala');
    expect(actorName({ id: 'u1', firstName: null, lastName: null, role: 'ADMIN' })).toBe('Administrateur');
    expect(actorName({ id: 'u2', firstName: 'QA', lastName: 'UX', role: 'SELLER' })).toBe('QA UX (vendeur)');
    expect(actorName({ id: 'u3', firstName: null, lastName: null, role: 'SELLER' })).toBe('Le vendeur');
  });
});
