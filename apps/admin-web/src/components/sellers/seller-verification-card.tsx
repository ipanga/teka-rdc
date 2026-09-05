'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import {
  ACTION_COPY,
  DOCUMENT_STATUS_UI,
  actorName,
  approveButtonLabel,
  describeHistory,
  describeStateChange,
  documentLinkError,
  documentTitle,
  documentTypeLabel,
  formatFileSize,
  formatMime,
  isDocumentViewable,
  isLiveDocument,
  linkSecondsLeft,
  validateReason,
  verificationStatusUi,
  type AdminVerificationAction,
  type AdminVerificationDocument,
  type AdminVerificationView,
  type DocumentLink,
} from '@/lib/seller-verification';

interface Props {
  sellerProfileId: string;
  /** Account-level state shown next to the document review so the two are never confused. */
  applicationStatus?: string | null;
  accountStatus?: string | null;
  city?: string | null;
  commune?: string | null;
  /** Called after a successful decision so the page header (status chips) can refresh silently. */
  onChanged?: () => void;
}

const APP_STATUS_LABEL: Record<string, string> = { PENDING: 'Demande en attente', APPROVED: 'Demande approuvée', REJECTED: 'Demande rejetée' };
const ACCOUNT_STATUS_LABEL: Record<string, string> = { ACTIVE: 'Compte actif', SUSPENDED: 'Compte suspendu', BANNED: 'Compte banni' };

const fmtDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-CD', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/** One issued link, kept only while it is valid (cleared at expiry). */
interface ActiveLink extends DocumentLink {
  documentId: string;
  issuedAtMs: number;
}

/**
 * « Vérification des documents » card on the admin seller page. The API is
 * authoritative: buttons come from `actions`, the requirement checklist from
 * `requiredTypes/missingTypes`, and every decision is a single POST whose 409
 * means "someone changed the state first" — the card then reloads and says so.
 * Document links are requested only on click, held for their 120 s and
 * dropped at expiry; the viewer is `ph-no-capture` so analytics never see them.
 */
export function SellerVerificationCard({ sellerProfileId, applicationStatus, accountStatus, city, commune, onChanged }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'ADMIN';

  const [data, setData] = useState<AdminVerificationView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [pending, setPending] = useState<AdminVerificationAction | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  const [link, setLink] = useState<ActiveLink | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [linkExpiredFor, setLinkExpiredFor] = useState<string | null>(null);
  const [linkLoadingId, setLinkLoadingId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<{ documentId: string; message: string } | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await apiFetch<AdminVerificationView>(`/v1/admin/sellers/${sellerProfileId}/verification`);
      setData(res.data);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [sellerProfileId]);

  useEffect(() => { load(); }, [load]);

  // Countdown; the link object is dropped the moment it can no longer work.
  useEffect(() => {
    if (!link) return;
    const tick = () => {
      const left = linkSecondsLeft(link.issuedAtMs, link.expiresInSeconds, Date.now());
      setSecondsLeft(left);
      if (left <= 0) {
        setLinkExpiredFor(link.documentId);
        setLink(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [link]);

  const requestLink = async (doc: AdminVerificationDocument) => {
    if (linkLoadingId) return;
    setLinkLoadingId(doc.id);
    setLinkError(null);
    setLinkExpiredFor(null);
    setLink(null);
    try {
      const res = await apiFetch<DocumentLink>(`/v1/admin/sellers/${sellerProfileId}/verification/documents/${doc.id}/url`);
      setLink({ ...res.data, documentId: doc.id, issuedAtMs: Date.now() });
    } catch (err) {
      setLinkError({ documentId: doc.id, message: documentLinkError(err instanceof ApiError ? err.status : null) });
    } finally {
      setLinkLoadingId(null);
    }
  };

  const openLink = () => {
    if (!link) return;
    // No <a href>: the URL never lands in the DOM or in an autocaptured attribute.
    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const ask = (action: AdminVerificationAction) => {
    setReason('');
    setReasonError(null);
    setDialogError(null);
    setPending(action);
  };

  const confirm = async () => {
    if (!pending || !data || submitLock.current) return;
    const copy = ACTION_COPY[pending];
    const err = validateReason(reason, copy.reasonRequired);
    if (err) { setReasonError(err); return; }
    submitLock.current = true;
    setSubmitting(true);
    setDialogError(null);
    const before = data.verificationStatus;
    try {
      const body = reason.trim() ? { reason: reason.trim() } : {};
      const res = await apiFetch<AdminVerificationView>(`/v1/admin/sellers/${sellerProfileId}/verification/${pending}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setData(res.data);
      setPending(null);
      setLink(null);
      onChanged?.();
      setFeedback({
        type: 'success',
        message:
          pending === 'approve'
            ? 'Boutique vérifiée : le badge « Vérifié » est actif et le vendeur a été prévenu.'
            : pending === 'reject'
              ? 'Vérification refusée : le motif a été transmis au vendeur.'
              : 'Vérification révoquée : le badge est retiré, le compte vendeur reste actif.',
      });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      const msg = err instanceof ApiError ? err.message : 'L’action n’a pas pu être appliquée. Réessayez.';
      if (status === 409) {
        // Stale state: someone (another admin, or the seller replacing a document) moved first.
        setPending(null);
        setIsLoading(true);
        try {
          const fresh = await apiFetch<AdminVerificationView>(`/v1/admin/sellers/${sellerProfileId}/verification`);
          setData(fresh.data);
          onChanged?.();
          setFeedback({ type: 'error', message: describeStateChange(before, fresh.data.verificationStatus) });
        } catch {
          setFeedback({ type: 'error', message: msg });
        } finally {
          setIsLoading(false);
        }
      } else {
        setDialogError(msg);
      }
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const ui = data ? verificationStatusUi(data.verificationStatus) : null;
  const liveDocs = data ? data.documents.filter(isLiveDocument) : [];
  const archivedDocs = data ? data.documents.filter((d) => !isLiveDocument(d)) : [];

  return (
    <section className="admin-card p-5" aria-labelledby="seller-verification-title" aria-busy={isLoading}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 id="seller-verification-title" className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Vérification des documents</h2>
          <p className="text-xs text-muted-foreground mt-1">Examen des justificatifs et badge « Vérifié ». Distinct de l’approbation du compte vendeur.</p>
        </div>
        {ui && (
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${ui.tone}`}>{ui.label}</span>
        )}
      </div>

      {feedback && (
        <div role="status" className={`mb-3 rounded-lg px-3 py-2 text-sm font-medium ${feedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {feedback.message}
        </div>
      )}

      {isLoading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-5 animate-pulse rounded bg-muted" />)}
        </div>
      ) : loadError || !data || !ui ? (
        <div className="text-center py-4">
          <p className="text-sm text-destructive">Impossible de charger la vérification de ce vendeur.</p>
          <button type="button" onClick={load} className="admin-button-secondary mt-3">Réessayer</button>
        </div>
      ) : (
        <>
          {/* Three states that must never be confused */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Compte vendeur</dt>
              <dd className="mt-1 font-semibold text-foreground">
                {applicationStatus ? (APP_STATUS_LABEL[applicationStatus] ?? `Demande : ${applicationStatus}`) : '—'}
                {accountStatus ? <span className="block text-xs font-normal text-muted-foreground">{ACCOUNT_STATUS_LABEL[accountStatus] ?? `Compte : ${accountStatus}`}</span> : null}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Examen des documents</dt>
              <dd className="mt-1 font-semibold text-foreground">{ui.label}</dd>
              <dd className="text-xs text-muted-foreground">
                {data.verificationStatus === 'PENDING_REVIEW' && `Soumis le ${fmtDateTime(data.verificationSubmittedAt)}`}
                {data.verificationStatus === 'VERIFIED' && `Vérifié le ${fmtDateTime(data.verifiedAt)}`}
                {data.verificationStatus === 'REJECTED' && (data.verificationRevokedAt && (!data.verificationRejectedAt || data.verificationRevokedAt > data.verificationRejectedAt) ? `Révoqué le ${fmtDateTime(data.verificationRevokedAt)}` : `Refusé le ${fmtDateTime(data.verificationRejectedAt)}`)}
                {data.verificationStatus === 'NOT_SUBMITTED' && 'Aucun dossier complet reçu'}
              </dd>
            </div>
            <div className="rounded-lg bg-muted/60 p-3">
              <dt className="text-xs text-muted-foreground">Badge « Vérifié »</dt>
              <dd className={`mt-1 font-semibold ${data.verificationStatus === 'VERIFIED' ? 'text-success' : 'text-foreground'}`}>
                {data.verificationStatus === 'VERIFIED' ? 'Affiché' : 'Non affiché'}
              </dd>
              <dd className="text-xs text-muted-foreground">{data.businessType === 'company' ? 'Entreprise' : 'Particulier'}{city ? ` · ${city}` : ''}{commune ? ` · ${commune}` : ''}</dd>
            </div>
          </dl>

          <p className="mt-3 text-sm text-foreground">{ui.hint}</p>
          {data.verificationNote && data.verificationStatus === 'REJECTED' && (
            <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="font-medium">Motif transmis au vendeur : </span>{data.verificationNote}
            </p>
          )}

          {/* Requirement checklist — from the API */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents requis ({data.businessType === 'company' ? 'entreprise' : 'particulier'})</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {data.requiredTypes.map((t) => {
                const missing = data.missingTypes.includes(t);
                return (
                  <li key={t} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${missing ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-success/30 bg-success/5 text-success'}`}>
                    <span aria-hidden="true">{missing ? '○' : '✓'}</span>
                    {documentTypeLabel(t)}
                    <span className="sr-only">{missing ? ' manquant' : ' fourni'}</span>
                  </li>
                );
              })}
            </ul>
            {data.missingTypes.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">Dossier incomplet : la vérification ne peut pas être accordée tant qu’un document requis manque.</p>
            )}
          </div>

          {/* Live documents */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documents soumis</h3>
            {liveDocs.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Aucun document en cours. {archivedDocs.length > 0 ? 'Les anciennes versions sont dans l’historique ci-dessous.' : ''}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                {liveDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    canView={isAdmin}
                    loading={linkLoadingId === doc.id}
                    link={link?.documentId === doc.id ? link : null}
                    secondsLeft={secondsLeft}
                    expired={linkExpiredFor === doc.id}
                    error={linkError?.documentId === doc.id ? linkError.message : null}
                    onRequest={() => requestLink(doc)}
                    onOpen={openLink}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Actions — only what the API allows right now */}
          {isAdmin && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {data.actions.approve && (
                <button type="button" onClick={() => ask('approve')} disabled={!!pending} className="admin-button-primary">{approveButtonLabel(data.verificationStatus)}</button>
              )}
              {data.actions.reject && (
                <button type="button" onClick={() => ask('reject')} disabled={!!pending} className="inline-flex min-h-11 items-center rounded-lg bg-destructive/10 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50">Refuser</button>
              )}
              {data.actions.revoke && (
                <button type="button" onClick={() => ask('revoke')} disabled={!!pending} className="inline-flex min-h-11 items-center rounded-lg border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">Révoquer la vérification</button>
              )}
              {!data.actions.approve && !data.actions.reject && !data.actions.revoke && (
                <p className="text-sm text-muted-foreground">
                  {data.verificationStatus === 'NOT_SUBMITTED' || data.missingTypes.length > 0
                    ? 'Aucune action possible : le vendeur doit d’abord fournir les documents requis.'
                    : 'Aucune action possible dans l’état actuel.'}
                </p>
              )}
              <button type="button" onClick={() => { setFeedback(null); setLink(null); load(); onChanged?.(); }} className="ml-auto text-sm text-primary hover:underline">Actualiser</button>
            </div>
          )}
          {!isAdmin && (
            <p className="mt-4 text-xs text-muted-foreground">Lecture seule : la consultation des documents et les décisions sont réservées aux administrateurs.</p>
          )}

          {/* History */}
          <div className="mt-5">
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="text-sm font-medium text-foreground hover:underline" aria-expanded={showHistory}>
              {showHistory ? 'Masquer l’historique' : `Historique (${data.history.length})`}
            </button>
            {showHistory && (
              <>
                {data.history.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Aucun événement enregistré.</p>
                ) : (
                  <ol className="mt-2 space-y-2 border-l border-border pl-4">
                    {data.history.map((h) => {
                      const d = describeHistory(h);
                      return (
                        <li key={h.id} className="text-sm">
                          <p className="font-medium text-foreground">{d.title}</p>
                          {d.detail && <p className="text-muted-foreground">{d.detail}</p>}
                          <p className="text-xs text-muted-foreground">{fmtDateTime(h.createdAt)} · {actorName(h.actor)}</p>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {archivedDocs.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Anciennes versions</p>
                    <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                      {archivedDocs.map((doc) => (
                        <li key={doc.id}>
                          {documentTitle(doc)} · {DOCUMENT_STATUS_UI[doc.status].label} · {formatMime(doc.mimeType)}, {formatFileSize(doc.sizeBytes)} · soumis le {fmtDateTime(doc.submittedAt)}
                          {doc.rejectionReason ? ` · Motif : ${doc.rejectionReason}` : ''}
                          {doc.purgedAt ? ' · fichier supprimé (rétention)' : doc.purgeAfter ? ` · suppression prévue le ${fmtDateTime(doc.purgeAfter)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {pending && data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button type="button" aria-label="Annuler" className="fixed inset-0 bg-black/50" onClick={() => !submitting && setPending(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="seller-verification-dialog" className="relative mx-4 w-full max-w-md rounded-xl border border-border bg-white shadow-xl">
            <div className="p-6">
              <h3 id="seller-verification-dialog" className="text-lg font-semibold text-foreground">{ACTION_COPY[pending].title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{data.businessName}</p>
              <p className="mt-3 text-sm text-foreground">{ACTION_COPY[pending].body}</p>
              <label className="mt-4 block text-sm font-medium text-foreground" htmlFor="seller-verification-reason">
                {ACTION_COPY[pending].reasonLabel}{ACTION_COPY[pending].reasonRequired && <span className="text-destructive"> *</span>}
              </label>
              <textarea
                id="seller-verification-reason"
                value={reason}
                onChange={(e) => { setReason(e.target.value); setReasonError(null); }}
                rows={3}
                maxLength={500}
                placeholder={ACTION_COPY[pending].reasonRequired ? 'Ex. : le RCCM fourni est illisible, merci de rescanner le document en entier.' : 'Facultatif'}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
              {reasonError && <p role="alert" className="mt-1 text-xs text-destructive">{reasonError}</p>}
              {dialogError && <p role="alert" className="mt-3 text-sm text-destructive">{dialogError}</p>}
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setPending(null)} disabled={submitting} className="admin-button-secondary">Annuler</button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={submitting}
                  className={ACTION_COPY[pending].destructive ? 'inline-flex min-h-11 items-center rounded-lg bg-destructive px-4 py-2.5 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-50' : 'admin-button-primary'}
                >
                  {submitting ? 'Envoi…' : ACTION_COPY[pending].button}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function DocumentRow({ doc, canView, loading, link, secondsLeft, expired, error, onRequest, onOpen }: {
  doc: AdminVerificationDocument;
  canView: boolean;
  loading: boolean;
  link: ActiveLink | null;
  secondsLeft: number;
  expired: boolean;
  error: string | null;
  onRequest: () => void;
  onOpen: () => void;
}) {
  const status = DOCUMENT_STATUS_UI[doc.status];
  const viewable = isDocumentViewable(doc);
  const isImage = doc.mimeType.startsWith('image/');
  return (
    <li className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{documentTitle(doc)}</p>
          <p className="text-xs text-muted-foreground">
            {formatMime(doc.mimeType)}, {formatFileSize(doc.sizeBytes)} · soumis le {fmtDateTime(doc.submittedAt)}
            {doc.reviewedAt ? ` · examiné le ${fmtDateTime(doc.reviewedAt)}` : ''}
          </p>
          {doc.rejectionReason && <p className="mt-1 text-xs text-destructive">Motif : {doc.rejectionReason}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${status.tone}`}>{status.label}</span>
          {canView && (
            viewable ? (
              <button type="button" onClick={onRequest} disabled={loading || !!link} className="admin-button-secondary !min-h-9 !px-3 !py-1.5 text-xs">
                {loading ? 'Génération…' : link ? 'Lien actif' : expired || error ? 'Générer un nouveau lien' : 'Voir le document'}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">{doc.purgedAt ? 'Fichier supprimé (rétention)' : 'Fichier indisponible'}</span>
            )
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
      {expired && !link && !error && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">Le lien de consultation a expiré (validité limitée). Générez un nouveau lien pour consulter le document.</p>
      )}
      {link && (
        <div className="ph-no-capture mt-3 rounded-lg border border-border bg-muted/40 p-3" data-sentry-block>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Lien de consultation valable encore <span className="font-semibold text-foreground">{secondsLeft} s</span> · consultation enregistrée dans l’historique.
            </p>
            <button type="button" onClick={onOpen} className="admin-button-primary !min-h-9 !px-3 !py-1.5 text-xs">
              {isImage ? 'Ouvrir en plein écran' : 'Ouvrir le PDF'}
            </button>
          </div>
          {isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={link.url} alt={documentTitle(doc)} className="mt-3 max-h-80 w-full rounded-lg bg-white object-contain" />
          )}
        </div>
      )}
    </li>
  );
}
