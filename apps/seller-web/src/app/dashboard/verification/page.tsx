'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api-client';
import { PageHeader } from '@/components/ui/page-header';
import {
  currentDocument,
  DOCUMENT_STATUS_UI,
  DOCUMENT_TYPE_UI,
  documentFileLabel,
  formatFileSize,
  optionalDocumentTypes,
  replacementNeedsWarning,
  validateDocument,
  verificationStatusUi,
  type SellerDocumentType,
  type SellerDocumentView,
  type VerificationStatusPayload,
} from '@/lib/verification';

/**
 * « Vérification de la boutique » — the seller's own status, the documents
 * Teka needs (from the API's `requiredTypes`, never a local rule) and one
 * upload flow per document. The API decides every transition; after each
 * upload the page renders the status the API returns, so a VERIFIED seller
 * who replaces material evidence sees PENDING_REVIEW immediately (D5).
 */
export default function VerificationPage() {
  const [data, setData] = useState<VerificationStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<SellerDocumentType | null>(null);
  const [tileError, setTileError] = useState<{ type: SellerDocumentType; message: string } | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [pendingReplace, setPendingReplace] = useState<SellerDocumentType | null>(null);
  const [otherLabel, setOtherLabel] = useState('');
  const [askingLabel, setAskingLabel] = useState(false);
  const inputs = useRef<Partial<Record<SellerDocumentType, HTMLInputElement | null>>>({});
  const busy = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<VerificationStatusPayload>('/v1/sellers/verification');
      setData(res.data);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Impossible de charger votre vérification.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    window.setTimeout(() => setFeedback(null), 6000);
  };

  /** Opens the native file picker after the D5 warning / OTHER label. */
  const startUpload = (type: SellerDocumentType) => {
    if (!data || uploadingType || busy.current) return;
    if (replacementNeedsWarning(data, type)) {
      setPendingReplace(type);
      return;
    }
    if (type === 'OTHER' && !otherLabel.trim()) {
      setAskingLabel(true);
      return;
    }
    inputs.current[type]?.click();
  };

  const onFileChosen = async (type: SellerDocumentType, file: File | null) => {
    if (!file || !data || busy.current) return;
    busy.current = true;
    setTileError(null);
    try {
      const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      const problem = validateDocument(file, head, data.limits);
      if (problem) {
        setTileError({ type, message: problem });
        return;
      }
      setUploadingType(type);
      const form = new FormData();
      form.append('type', type);
      if (type === 'OTHER') form.append('label', otherLabel.trim());
      form.append('document', file, file.name);
      const res = await apiFetch<VerificationStatusPayload>('/v1/sellers/verification/documents', {
        method: 'POST',
        body: form,
      });
      setData(res.data);
      setOtherLabel('');
      showFeedback(
        'success',
        res.data.verificationStatus === 'PENDING_REVIEW'
          ? 'Document envoyé — vos documents sont en cours de vérification.'
          : 'Document envoyé.',
      );
    } catch (err) {
      setTileError({ type, message: err instanceof ApiError ? err.message : "Échec de l'envoi. Vérifiez votre connexion et réessayez." });
    } finally {
      setUploadingType(null);
      busy.current = false;
      const input = inputs.current[type];
      if (input) input.value = '';
    }
  };

  if (loading) {
    return (
      <div className="seller-page max-w-3xl">
        <div className="h-8 w-64 bg-muted rounded animate-pulse mb-4" />
        <div className="h-40 bg-muted rounded-xl animate-pulse mb-4" />
        <div className="h-32 bg-muted rounded-xl animate-pulse" />
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="seller-page max-w-3xl">
        <PageHeader eyebrow="Compte" title="Vérification de la boutique" />
        <div className="bg-white rounded-xl border border-border p-8 text-center">
          <p className="text-sm text-destructive mb-3">{loadError ?? 'Impossible de charger votre vérification.'}</p>
          <button type="button" className="seller-button-secondary" onClick={() => { setLoading(true); load(); }}>
            {'Réessayer'}
          </button>
        </div>
      </div>
    );
  }

  const ui = verificationStatusUi(data.verificationStatus);
  const isCompany = data.businessType === 'company';
  const note = data.verificationStatus === 'REJECTED' ? data.verificationNote : null;
  const missing = data.missingTypes.length;
  const maxMb = Math.round(data.limits.maxSizeBytes / (1024 * 1024));

  return (
    <div className="seller-page max-w-3xl">
      <PageHeader
        eyebrow="Compte"
        title="Vérification de la boutique"
        description="Teka RDC examine vos documents justificatifs et affiche ensuite le badge « Vérifié » sur vos fiches produits."
      />

      {feedback && (
        <div
          role="status"
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${feedback.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
        >
          {feedback.msg}
        </div>
      )}

      <section className="mb-6 bg-white rounded-xl border border-border p-6" aria-labelledby="verif-status">
        <p className="text-xs text-muted-foreground mb-1">{'Statut'}</p>
        <h2 id="verif-status" className={`inline-flex mb-3 px-3 py-1 rounded-full text-base font-semibold ${ui.tone}`}>
          {ui.label}
        </h2>
        <p className="text-sm text-foreground leading-relaxed">{ui.hint}</p>
        {note && (
          <p className="mt-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive leading-relaxed">
            {'Motif de Teka RDC : '}{note}
          </p>
        )}
        {data.verificationStatus === 'NOT_SUBMITTED' && missing > 0 && (
          <p className="mt-3 text-sm font-medium text-foreground">
            {missing === 1 ? 'Il manque 1 document pour lancer la vérification.' : `Il manque ${missing} documents pour lancer la vérification.`}
          </p>
        )}
      </section>

      <h2 className="text-base font-semibold text-foreground mb-1">
        {isCompany ? 'Documents requis pour une entreprise' : 'Document requis'}
      </h2>
      <p className="text-xs text-muted-foreground mb-3">{`Formats acceptés : PDF, JPEG, PNG — ${maxMb} Mo maximum par document.`}</p>
      <div className="space-y-3">
        {data.requiredTypes.map((type) => (
          <DocumentTile
            key={type}
            type={type}
            required
            document={currentDocument(data.documents, type)}
            uploading={uploadingType === type}
            disabled={uploadingType !== null}
            error={tileError?.type === type ? tileError.message : null}
            onUpload={() => startUpload(type)}
            inputRef={(el) => { inputs.current[type] = el; }}
            onFile={(f) => onFileChosen(type, f)}
          />
        ))}
      </div>

      {optionalDocumentTypes(data.requiredTypes).length > 0 && (
        <>
          <h2 className="text-base font-semibold text-foreground mt-8 mb-3">{'Documents facultatifs'}</h2>
          <div className="space-y-3">
            {optionalDocumentTypes(data.requiredTypes).map((type) => (
              <DocumentTile
                key={type}
                type={type}
                required={false}
                document={currentDocument(data.documents, type)}
                uploading={uploadingType === type}
                disabled={uploadingType !== null}
                error={tileError?.type === type ? tileError.message : null}
                onUpload={() => startUpload(type)}
                inputRef={(el) => { inputs.current[type] = el; }}
                onFile={(f) => onFileChosen(type, f)}
              />
            ))}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-muted-foreground leading-relaxed">
        {"Vos documents sont stockés de façon privée et ne sont consultés que par l'équipe Teka RDC pour cette vérification. Ils ne sont jamais publiés."}
      </p>

      {pendingReplace && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="replace-title">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 id="replace-title" className="text-lg font-semibold text-foreground mb-2">{'Remplacer ce document ?'}</h3>
            <p className="text-sm text-foreground leading-relaxed mb-5">
              {"Après l'envoi, votre boutique repassera « En attente de vérification » jusqu'à ce que Teka RDC ait examiné le nouveau document."}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="seller-button-secondary" onClick={() => setPendingReplace(null)}>{'Annuler'}</button>
              <button
                type="button"
                className="seller-button-primary"
                onClick={() => {
                  const type = pendingReplace;
                  setPendingReplace(null);
                  if (type === 'OTHER' && !otherLabel.trim()) setAskingLabel(true);
                  else inputs.current[type]?.click();
                }}
              >
                {'Remplacer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {askingLabel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" role="dialog" aria-modal="true" aria-labelledby="label-title">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 id="label-title" className="text-lg font-semibold text-foreground mb-3">{'Quel document ?'}</h3>
            <label htmlFor="otherLabel" className="block text-sm font-medium text-foreground mb-1">{'Libellé'}</label>
            <input
              id="otherLabel"
              type="text"
              maxLength={80}
              autoFocus
              value={otherLabel}
              onChange={(e) => setOtherLabel(e.target.value)}
              placeholder="Ex. : Patente 2026"
              className="w-full px-3 py-2 border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" className="seller-button-secondary" onClick={() => { setAskingLabel(false); setOtherLabel(''); }}>{'Annuler'}</button>
              <button
                type="button"
                className="seller-button-primary"
                disabled={otherLabel.trim().length < 2}
                onClick={() => { setAskingLabel(false); inputs.current.OTHER?.click(); }}
              >
                {'Continuer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentTile({
  type,
  required,
  document,
  uploading,
  disabled,
  error,
  onUpload,
  inputRef,
  onFile,
}: {
  type: SellerDocumentType;
  required: boolean;
  document: SellerDocumentView | null;
  uploading: boolean;
  disabled: boolean;
  error: string | null;
  onUpload: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
  onFile: (file: File | null) => void;
}) {
  const typeUi = DOCUMENT_TYPE_UI[type];
  const docUi = document ? DOCUMENT_STATUS_UI[document.status] : null;
  const title = document?.type === 'OTHER' && document.label ? document.label : typeUi.label;
  const buttonLabel = error ? 'Réessayer' : document ? 'Remplacer' : 'Ajouter';
  const primary = !document || document.status === 'REJECTED';
  return (
    <div className="bg-white rounded-xl border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <span className={`text-[11px] font-semibold ${required ? 'text-primary' : 'text-muted-foreground'}`}>{required ? 'Requis' : 'Facultatif'}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{typeUi.hint}</p>
          <p className={`text-sm mt-2 ${docUi ? docUi.tone : 'text-muted-foreground'}`}>
            {document && docUi
              ? `${docUi.label} · ${documentFileLabel(document.mimeType)}, ${formatFileSize(document.sizeBytes)}`
              : 'Pas encore fourni'}
          </p>
          {document?.status === 'REJECTED' && document.rejectionReason && (
            <p className="text-xs text-destructive mt-1">{'Motif : '}{document.rejectionReason}</p>
          )}
          {uploading && (
            <p className="text-xs text-muted-foreground mt-2" role="status" aria-live="polite">
              <span className="inline-block h-3 w-3 mr-2 align-middle animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              {'Envoi en cours…'}
            </p>
          )}
          {error && <p className="text-xs text-destructive mt-2" role="alert">{error}</p>}
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="sr-only"
            aria-label={`${title} — choisir un fichier`}
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className={primary ? 'seller-button-primary' : 'seller-button-secondary'}
            disabled={disabled}
            onClick={onUpload}
          >
            {uploading ? 'Envoi…' : buttonLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
