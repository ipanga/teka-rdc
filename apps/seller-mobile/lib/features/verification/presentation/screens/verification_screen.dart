import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/layout/responsive.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/theme/teka_spacing.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../../../core/widgets/seller_list_state.dart';
import '../../../../core/widgets/seller_status_badge.dart';
import '../../../home/presentation/widgets/dashboard_rows.dart';
import '../../data/verification_repository.dart';
import '../verification_status.dart';

/// « Vérification de la boutique » — the seller's own verification status,
/// the documents Teka needs (from the API's `requiredTypes`, never a local
/// rule) and one upload flow per document. The API decides every state
/// transition; this screen only renders the status it returns after each
/// upload, so a VERIFIED seller who replaces material evidence sees the
/// server's PENDING_REVIEW immediately (D5), never a stale « Vérifié ».
///
/// Seller UX PR F: tones are the status semantics (neutral / warning /
/// success / destructive foreground tokens), a refused verification opens on
/// an « Action requise » strip carrying Teka's seller-facing reason and one
/// button that goes straight to the refused document, loading is a static
/// skeleton, the error is the API's message with a retry.
class VerificationScreen extends ConsumerStatefulWidget {
  const VerificationScreen({super.key, this.pickOverride});

  /// Test seam: replaces the source sheet + native pickers (which cannot be
  /// driven in widget tests) with a function returning the picked bytes.
  final Future<PickedDocument?> Function(String type)? pickOverride;

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  final ImagePicker _picker = ImagePicker();
  VerificationStatusModel? _status;
  bool _loading = true;
  String? _error;
  // Type currently uploading (guards against repeated taps) + progress 0..1.
  String? _uploadingType;
  double _progress = 0;
  String? _uploadError;
  String? _uploadErrorType;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = _status == null;
      _error = null;
    });
    try {
      final s = await ref.read(verificationRepositoryProvider).getStatus();
      if (!mounted) return;
      setState(() => _status = s);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = friendlyErrorMessage(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  // ---------------------------------------------------------------------------
  // Picking + uploading
  // ---------------------------------------------------------------------------

  Future<void> _startUpload(String type) async {
    final status = _status;
    if (status == null || _uploadingType != null || _busy) return;
    _busy = true;
    try {
      await _runUpload(status, type);
    } finally {
      _busy = false;
    }
  }

  // Set from the first tap until the flow ends (picker, dialogs, upload), so
  // a second tap while the native picker is open cannot start a second flow.
  bool _busy = false;

  Future<void> _runUpload(VerificationStatusModel status, String type) async {
    // A VERIFIED seller replacing required evidence goes back to review (D5).
    final existing = status.documentOf(type);
    // The rejected-document button of the strip: nothing more to confirm,
    // the strip already said why.
    if (status.verificationStatus == 'VERIFIED' &&
        existing != null &&
        status.requiredTypes.contains(type)) {
      final ok = await _confirm(
        title: 'Remplacer ce document ?',
        body:
            'Après l’envoi, votre boutique repassera « En attente de vérification » jusqu’à ce que Teka RDC ait examiné le nouveau document.',
        confirmLabel: 'Remplacer',
      );
      if (ok != true) return;
    }

    String? label;
    if (type == 'OTHER') {
      label = await _askLabel();
      if (label == null || label.trim().length < 2) return;
    }

    final picked = widget.pickOverride != null
        ? await widget.pickOverride!(type)
        : await _pick(type);
    if (picked == null) return;

    final limits = status.limits;
    final problem = validateDocumentBytes(
      picked.bytes,
      maxSizeBytes: limits.maxSizeBytes,
      acceptedMimeTypes: limits.acceptedMimeTypes,
    );
    if (problem != null) {
      setState(() {
        _uploadError = problem;
        _uploadErrorType = type;
      });
      return;
    }

    setState(() {
      _uploadingType = type;
      _progress = 0;
      _uploadError = null;
      _uploadErrorType = null;
    });
    try {
      final updated =
          await ref.read(verificationRepositoryProvider).uploadDocument(
                type: type,
                label: label,
                bytes: picked.bytes,
                filename: picked.filename,
                mimeType: picked.mimeType,
                onProgress: (sent, total) {
                  if (!mounted || total <= 0) return;
                  setState(() => _progress = sent / total);
                },
              );
      if (!mounted) return;
      setState(() => _status = updated);
      showAppSnackbar(
        context,
        message: updated.verificationStatus == 'PENDING_REVIEW'
            ? 'Document envoyé — vos documents sont en cours de vérification.'
            : 'Document envoyé.',
        tone: AppSnackbarTone.success,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _uploadError = friendlyErrorMessage(e);
        _uploadErrorType = type;
      });
    } finally {
      if (mounted) setState(() => _uploadingType = null);
    }
  }

  /// Source sheet: camera + gallery for identity photos, PDF for anything
  /// (RCCM / Identification Nationale are usually PDFs).
  Future<PickedDocument?> _pick(String type) async {
    final source = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Prendre une photo'),
              onTap: () => Navigator.of(ctx).pop('camera'),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Choisir une photo'),
              onTap: () => Navigator.of(ctx).pop('gallery'),
            ),
            ListTile(
              leading: const Icon(Icons.picture_as_pdf_outlined),
              title: const Text('Choisir un fichier PDF'),
              onTap: () => Navigator.of(ctx).pop('pdf'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (source == null) return null;
    try {
      if (source == 'pdf') {
        final f = await FilePicker.pickFile(
          type: FileType.custom,
          allowedExtensions: const ['pdf'],
        );
        if (f == null) return null;
        final bytes = await f.readAsBytes();
        return PickedDocument(bytes, 'document.pdf', 'application/pdf');
      }
      // image_picker re-encodes as JPEG when imageQuality is set, which keeps
      // the upload small on 2G/3G and lands in the API's accepted formats.
      final x = await _picker.pickImage(
        source: source == 'camera' ? ImageSource.camera : ImageSource.gallery,
        maxWidth: 2000,
        maxHeight: 2000,
        imageQuality: 85,
      );
      if (x == null) return null;
      final bytes = await x.readAsBytes();
      final mime = sniffDocumentMime(bytes) ?? 'image/jpeg';
      final ext = mime == 'image/png' ? 'png' : 'jpg';
      return PickedDocument(bytes, 'document.$ext', mime);
    } catch (_) {
      if (mounted) {
        showAppSnackbar(context,
            message: 'Impossible d’ouvrir ce fichier.',
            tone: AppSnackbarTone.error);
      }
      return null;
    }
  }

  Future<bool?> _confirm(
      {required String title,
      required String body,
      required String confirmLabel}) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Annuler')),
          FilledButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(confirmLabel)),
        ],
      ),
    );
  }

  Future<String?> _askLabel() {
    final ctrl = TextEditingController();
    return showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Quel document ?'),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          maxLength: 80,
          decoration: const InputDecoration(labelText: 'Ex. : Patente 2026'),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(null),
              child: const Text('Annuler')),
          FilledButton(
              onPressed: () => Navigator.of(ctx).pop(ctrl.text),
              child: const Text('Continuer')),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  /// The document a refused seller must redo first: the refused one, else
  /// the first missing required type.
  String? _correctionType(VerificationStatusModel s) {
    for (final type in s.requiredTypes) {
      if (s.documentOf(type)?.status == 'REJECTED') return type;
    }
    for (final d in s.documents) {
      if (d.status == 'REJECTED') return d.type;
    }
    return s.missingTypes.isNotEmpty ? s.missingTypes.first : null;
  }

  @override
  Widget build(BuildContext context) {
    final Widget body;
    if (_loading) {
      body = const VerificationSkeleton();
    } else if (_error != null && _status == null) {
      body = SellerListState(
        child: SellerListMessage(
          icon: Icons.cloud_off,
          title: 'Vérification indisponible',
          message: _error!,
          actionLabel: 'Réessayer',
          onAction: _load,
        ),
      );
    } else {
      body = RefreshIndicator(
        color: TekaColors.tekaRed,
        onRefresh: _load,
        child: _buildContent(_status!),
      );
    }
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Vérification de la boutique'),
      ),
      body: ReadableColumn(padding: EdgeInsets.zero, child: body),
    );
  }

  Widget _buildContent(VerificationStatusModel s) {
    final theme = Theme.of(context).textTheme;
    final ui = VerificationStatusUi.of(s.verificationStatus);
    // Only « Autre document » is offered beyond the API's required set: an
    // individual seller is never nudged towards company papers (D3).
    final optionalTypes =
        s.requiredTypes.contains('OTHER') ? const <String>[] : const ['OTHER'];
    final isCompany = s.businessType == 'company';
    final correction = ui.actionRequired ? _correctionType(s) : null;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
          TekaSpacing.md, TekaSpacing.sm, TekaSpacing.md, TekaSpacing.xxl),
      children: [
        if (_error != null) ...[
          DashboardErrorRow(title: 'Statut non actualisé', onRetry: _load),
          const SizedBox(height: TekaSpacing.xs),
        ],
        _StatusCard(
          ui: ui,
          status: s,
          onCorrect: correction == null || _uploadingType != null
              ? null
              : () => _startUpload(correction),
        ),
        const SizedBox(height: TekaSpacing.lg),
        Text(
          isCompany ? 'Documents requis pour une entreprise' : 'Document requis',
          style: theme.titleMedium,
        ),
        const SizedBox(height: TekaSpacing.xxs),
        Text(
          'Formats acceptés : PDF, JPEG, PNG — ${s.limits.maxSizeMb} Mo maximum par document.',
          style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
        ),
        const SizedBox(height: TekaSpacing.sm),
        for (final type in s.requiredTypes) ...[
          _DocumentTile(
            type: type,
            required: true,
            document: s.documentOf(type),
            uploading: _uploadingType == type,
            progress: _progress,
            error: _uploadErrorType == type ? _uploadError : null,
            disabled: _uploadingType != null,
            onUpload: () => _startUpload(type),
          ),
          const SizedBox(height: TekaSpacing.sm),
        ],
        if (optionalTypes.isNotEmpty) ...[
          const SizedBox(height: TekaSpacing.xs),
          Text('Documents facultatifs', style: theme.titleMedium),
          const SizedBox(height: TekaSpacing.sm),
          for (final type in optionalTypes) ...[
            _DocumentTile(
              type: type,
              required: false,
              document: s.documentOf(type),
              uploading: _uploadingType == type,
              progress: _progress,
              error: _uploadErrorType == type ? _uploadError : null,
              disabled: _uploadingType != null,
              onUpload: () => _startUpload(type),
            ),
            const SizedBox(height: TekaSpacing.sm),
          ],
        ],
        const SizedBox(height: TekaSpacing.xs),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.lock_outline,
              size: 16, color: TekaColors.mutedForeground),
          const SizedBox(width: TekaSpacing.xs),
          Expanded(
            child: Text(
              'Vos documents sont stockés de façon privée et ne sont consultés que par l’équipe Teka RDC pour cette vérification. Ils ne sont jamais publiés.',
              style: theme.bodySmall?.copyWith(color: TekaColors.mutedForeground),
            ),
          ),
        ]),
      ],
    );
  }
}

/// A document chosen by the seller, ready to upload.
class PickedDocument {
  final Uint8List bytes;
  final String filename;
  final String mimeType;
  const PickedDocument(this.bytes, this.filename, this.mimeType);
}

class _StatusCard extends StatelessWidget {
  final VerificationStatusUi ui;
  final VerificationStatusModel status;

  /// Present only when the seller must redo a document (REJECTED).
  final VoidCallback? onCorrect;
  const _StatusCard(
      {required this.ui, required this.status, required this.onCorrect});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final note = status.verificationStatus == 'REJECTED'
        ? (status.verificationNote ?? '').trim()
        : '';
    final missing = status.missingTypes.length;
    return Container(
      padding: const EdgeInsets.all(TekaSpacing.md),
      decoration: BoxDecoration(
        color: TekaColors.background,
        borderRadius: TekaRadius.lgAll,
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Statut de la vérification',
              style: theme.labelLarge?.copyWith(color: TekaColors.mutedForeground)),
          const SizedBox(height: TekaSpacing.xs),
          Align(
            alignment: Alignment.centerLeft,
            child: SellerStatusBadge(label: ui.label, icon: ui.icon, color: ui.color),
          ),
          const SizedBox(height: TekaSpacing.sm),
          Text(ui.hint, style: theme.bodyMedium),
          if (ui.actionRequired) ...[
            const SizedBox(height: TekaSpacing.sm),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(TekaSpacing.sm),
              decoration: BoxDecoration(
                color: TekaColors.destructiveSubtle,
                borderRadius: TekaRadius.mdAll,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.priority_high_rounded,
                        size: 18, color: TekaColors.destructiveForeground),
                    const SizedBox(width: TekaSpacing.xs),
                    Expanded(
                      child: Text('Action requise',
                          style: theme.titleSmall
                              ?.copyWith(color: TekaColors.destructiveForeground)),
                    ),
                  ]),
                  const SizedBox(height: TekaSpacing.xxs),
                  Text(
                    note.isEmpty
                        ? 'Motif de Teka RDC : non précisé.'
                        : 'Motif de Teka RDC : $note',
                    style: theme.bodyMedium
                        ?.copyWith(color: TekaColors.destructiveForeground),
                  ),
                  const SizedBox(height: TekaSpacing.xxs),
                  Text(
                    'Remplacez le document refusé ci-dessous ; Teka examinera de nouveau votre dossier.',
                    style: theme.bodySmall
                        ?.copyWith(color: TekaColors.destructiveForeground),
                  ),
                  if (onCorrect != null) ...[
                    const SizedBox(height: TekaSpacing.sm),
                    ElevatedButton.icon(
                      onPressed: onCorrect,
                      style: ElevatedButton.styleFrom(
                          minimumSize: const Size.fromHeight(44)),
                      icon: const Icon(Icons.upload_file_outlined, size: 18),
                      label: const Text('Remplacer le document refusé'),
                    ),
                  ],
                ],
              ),
            ),
          ],
          if (status.verificationStatus == 'NOT_SUBMITTED' && missing > 0) ...[
            const SizedBox(height: TekaSpacing.sm),
            Text(
              missing == 1
                  ? 'Il manque 1 document pour lancer la vérification.'
                  : 'Il manque $missing documents pour lancer la vérification.',
              style: theme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
            ),
          ],
        ],
      ),
    );
  }
}

class _DocumentTile extends StatelessWidget {
  final String type;
  final bool required;
  final SellerDocumentView? document;
  final bool uploading;
  final double progress;
  final String? error;
  final bool disabled;
  final VoidCallback onUpload;

  const _DocumentTile({
    required this.type,
    required this.required,
    required this.document,
    required this.uploading,
    required this.progress,
    required this.error,
    required this.disabled,
    required this.onUpload,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context).textTheme;
    final typeUi = DocumentTypeUi.of(type);
    final doc = document;
    final docUi = doc == null ? null : DocumentStatusUi.of(doc.status);
    final rejected = doc?.status == 'REJECTED';
    final title = doc?.type == 'OTHER' && doc?.label != null
        ? doc!.label!
        : typeUi.label;
    final buttonLabel = error != null
        ? 'Réessayer'
        : doc == null
            ? 'Ajouter'
            : 'Remplacer';
    final buttonIcon = Icon(
        error != null ? Icons.refresh_rounded : Icons.upload_file_outlined,
        size: 18);
    final stateLine = doc == null
        ? 'Pas encore fourni'
        : '${docUi!.label} · ${documentFileLabel(doc.mimeType)}, ${formatFileSize(doc.sizeBytes)}';
    return Semantics(
      container: true,
      label:
          '$title, ${required ? 'requis' : 'facultatif'}, $stateLine${rejected && (doc?.rejectionReason ?? '').isNotEmpty ? ', motif ${doc!.rejectionReason}' : ''}',
      child: Container(
        padding: const EdgeInsets.all(TekaSpacing.sm),
        decoration: BoxDecoration(
          color: TekaColors.background,
          borderRadius: TekaRadius.lgAll,
          border: Border.all(
              color: rejected ? TekaColors.destructive : TekaColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ExcludeSemantics(
              child: Wrap(
                spacing: TekaSpacing.xs,
                runSpacing: TekaSpacing.xxs,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(title, style: theme.titleSmall),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: TekaSpacing.xs, vertical: 2),
                    decoration: BoxDecoration(
                        color: required
                            ? TekaColors.warningSubtle
                            : TekaColors.muted,
                        borderRadius: TekaRadius.pillAll),
                    child: Text(required ? 'Requis' : 'Facultatif',
                        style: theme.labelSmall?.copyWith(
                            color: required
                                ? TekaColors.warningForeground
                                : TekaColors.neutralForeground,
                            fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 2),
            ExcludeSemantics(
              child: Text(typeUi.hint,
                  style: theme.bodySmall
                      ?.copyWith(color: TekaColors.mutedForeground)),
            ),
            const SizedBox(height: TekaSpacing.xs),
            ExcludeSemantics(
              child: doc == null
                  ? Row(children: [
                      const Icon(Icons.radio_button_unchecked,
                          size: 16, color: TekaColors.mutedForeground),
                      const SizedBox(width: TekaSpacing.xs),
                      Flexible(
                        child: Text('Pas encore fourni',
                            style: theme.bodySmall
                                ?.copyWith(color: TekaColors.mutedForeground)),
                      ),
                    ])
                  : Align(
                      alignment: Alignment.centerLeft,
                      child: SellerStatusBadge(
                          label: stateLine,
                          icon: docUi!.icon,
                          color: docUi.color,
                          compact: true),
                    ),
            ),
            if (rejected && (doc?.rejectionReason ?? '').isNotEmpty) ...[
              const SizedBox(height: TekaSpacing.xs),
              ExcludeSemantics(
                child: Text('Motif : ${doc!.rejectionReason}',
                    style: theme.bodySmall
                        ?.copyWith(color: TekaColors.destructiveForeground)),
              ),
            ],
            if (uploading) ...[
              const SizedBox(height: TekaSpacing.sm),
              ClipRRect(
                borderRadius: TekaRadius.smAll,
                child: LinearProgressIndicator(
                    value: progress > 0 && progress < 1 ? progress : null,
                    minHeight: 6),
              ),
              const SizedBox(height: TekaSpacing.xxs),
              Text(
                progress >= 1
                    ? 'Vérification du fichier…'
                    : 'Envoi en cours… ${(progress * 100).round()} %',
                style: theme.bodySmall
                    ?.copyWith(color: TekaColors.mutedForeground),
              ),
            ],
            if (error != null) ...[
              const SizedBox(height: TekaSpacing.xs),
              Semantics(
                liveRegion: true,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.error_outline,
                        size: 18, color: TekaColors.destructiveForeground),
                    const SizedBox(width: TekaSpacing.xs),
                    Expanded(
                        child: Text(error!,
                            style: theme.bodySmall?.copyWith(
                                color: TekaColors.destructiveForeground))),
                  ],
                ),
              ),
            ],
            const SizedBox(height: TekaSpacing.sm),
            Align(
              alignment: Alignment.centerRight,
              child: doc == null || rejected
                  ? FilledButton.icon(
                      onPressed: disabled ? null : onUpload,
                      icon: buttonIcon,
                      label: Text(buttonLabel),
                    )
                  : OutlinedButton.icon(
                      onPressed: disabled ? null : onUpload,
                      icon: buttonIcon,
                      label: Text(buttonLabel),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Static placeholder shaped like the screen (no spinner).
class VerificationSkeleton extends StatelessWidget {
  const VerificationSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    Widget card(List<Widget> children) => Container(
          width: double.infinity,
          padding: const EdgeInsets.all(TekaSpacing.md),
          decoration: BoxDecoration(
            color: TekaColors.background,
            borderRadius: TekaRadius.lgAll,
            border: Border.all(color: TekaColors.border),
          ),
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.start, children: children),
        );
    return Semantics(
      label: 'Chargement de la vérification',
      liveRegion: true,
      child: ExcludeSemantics(
        child: ListView(
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
              TekaSpacing.md, TekaSpacing.sm, TekaSpacing.md, TekaSpacing.xxl),
          children: [
            card(const [
              SkeletonBlock(width: 150, height: 14),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 140, height: 28, pill: true),
              SizedBox(height: TekaSpacing.sm),
              SkeletonBlock(width: double.infinity, height: 14),
              SizedBox(height: TekaSpacing.xxs),
              SkeletonBlock(width: 220, height: 14),
            ]),
            const SizedBox(height: TekaSpacing.lg),
            const SkeletonBlock(width: 160, height: 18),
            const SizedBox(height: TekaSpacing.sm),
            card(const [
              SkeletonBlock(width: 120, height: 16),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 240, height: 12),
              SizedBox(height: TekaSpacing.sm),
              SkeletonBlock(width: 110, height: 24, pill: true),
            ]),
            const SizedBox(height: TekaSpacing.sm),
            card(const [
              SkeletonBlock(width: 120, height: 16),
              SizedBox(height: TekaSpacing.xs),
              SkeletonBlock(width: 240, height: 12),
              SizedBox(height: TekaSpacing.sm),
              SkeletonBlock(width: 110, height: 24, pill: true),
            ]),
          ],
        ),
      ),
    );
  }
}
