import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/network/dio_error_messages.dart';
import '../../../../core/theme/teka_colors.dart';
import '../../../../core/widgets/adaptive_leading.dart';
import '../../../../core/widgets/app_snackbar.dart';
import '../../data/verification_repository.dart';
import '../verification_status.dart';

/// « Vérification de la boutique » — the seller's own verification status,
/// the documents Teka needs (from the API's `requiredTypes`, never a local
/// rule) and one upload flow per document. The API decides every state
/// transition; this screen only renders the status it returns after each
/// upload, so a VERIFIED seller who replaces material evidence sees the
/// server's PENDING_REVIEW immediately (D5), never a stale « Vérifié ».
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: const AdaptiveLeading(fallbackLocation: '/profile'),
        title: const Text('Vérification de la boutique'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? _ErrorState(message: _error!, onRetry: _load)
              : RefreshIndicator(
                  color: TekaColors.tekaRed,
                  onRefresh: _load,
                  child: _buildContent(_status!),
                ),
    );
  }

  Widget _buildContent(VerificationStatusModel s) {
    final ui = VerificationStatusUi.of(s.verificationStatus);
    // Only « Autre document » is offered beyond the API's required set: an
    // individual seller is never nudged towards company papers (D3).
    final optionalTypes =
        s.requiredTypes.contains('OTHER') ? const <String>[] : const ['OTHER'];
    final isCompany = s.businessType == 'company';
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        _StatusCard(ui: ui, status: s),
        const SizedBox(height: 20),
        Text(
          isCompany
              ? 'Documents requis pour une entreprise'
              : 'Document requis',
          style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: TekaColors.foreground),
        ),
        const SizedBox(height: 4),
        Text(
          'Formats acceptés : PDF, JPEG, PNG — ${s.limits.maxSizeMb} Mo maximum par document.',
          style: const TextStyle(
              fontSize: 12.5, color: TekaColors.mutedForeground, height: 1.35),
        ),
        const SizedBox(height: 10),
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
          const SizedBox(height: 10),
        ],
        if (optionalTypes.isNotEmpty) ...[
          const SizedBox(height: 10),
          const Text(
            'Documents facultatifs',
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: TekaColors.foreground),
          ),
          const SizedBox(height: 10),
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
            const SizedBox(height: 10),
          ],
        ],
        const SizedBox(height: 12),
        const Text(
          'Vos documents sont stockés de façon privée et ne sont consultés que par l’équipe Teka RDC pour cette vérification. Ils ne sont jamais publiés.',
          style: TextStyle(
              fontSize: 12.5, color: TekaColors.mutedForeground, height: 1.4),
        ),
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
  const _StatusCard({required this.ui, required this.status});

  @override
  Widget build(BuildContext context) {
    final note = status.verificationStatus == 'REJECTED'
        ? status.verificationNote
        : null;
    final missing = status.missingTypes.length;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ui.color.withValues(alpha: 0.35)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: ui.color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(ui.icon, color: ui.color, semanticLabel: ui.label),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Statut',
                        style: TextStyle(
                            fontSize: 12, color: TekaColors.mutedForeground)),
                    Text(
                      ui.label,
                      style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: ui.color),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(ui.hint,
              style: const TextStyle(
                  fontSize: 13.5, color: TekaColors.foreground, height: 1.4)),
          if (note != null && note.trim().isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: TekaColors.destructive.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                'Motif de Teka RDC : $note',
                style: const TextStyle(
                    fontSize: 13, color: TekaColors.destructive, height: 1.4),
              ),
            ),
          ],
          if (status.verificationStatus == 'NOT_SUBMITTED' && missing > 0) ...[
            const SizedBox(height: 12),
            Text(
              missing == 1
                  ? 'Il manque 1 document pour lancer la vérification.'
                  : 'Il manque $missing documents pour lancer la vérification.',
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: TekaColors.foreground),
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
    final typeUi = DocumentTypeUi.of(type);
    final doc = document;
    final docUi = doc == null ? null : DocumentStatusUi.of(doc.status);
    final buttonLabel = doc == null ? 'Ajouter' : 'Remplacer';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: TekaColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            doc?.type == 'OTHER' && doc?.label != null
                                ? doc!.label!
                                : typeUi.label,
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: TekaColors.foreground),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          required ? 'Requis' : 'Facultatif',
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700,
                            color: required
                                ? TekaColors.tekaRed
                                : TekaColors.mutedForeground,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(typeUi.hint,
                        style: const TextStyle(
                            fontSize: 12.5,
                            color: TekaColors.mutedForeground,
                            height: 1.35)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          if (doc == null)
            const Row(
              children: [
                Icon(Icons.radio_button_unchecked,
                    size: 18, color: TekaColors.mutedForeground),
                SizedBox(width: 6),
                Text('Pas encore fourni',
                    style: TextStyle(
                        fontSize: 13, color: TekaColors.mutedForeground)),
              ],
            )
          else ...[
            Row(
              children: [
                Icon(docUi!.icon,
                    size: 18, color: docUi.color, semanticLabel: docUi.label),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '${docUi.label} · ${documentFileLabel(doc.mimeType)}, ${formatFileSize(doc.sizeBytes)}',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: docUi.color),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            if (doc.status == 'REJECTED' &&
                (doc.rejectionReason ?? '').isNotEmpty) ...[
              const SizedBox(height: 4),
              Text('Motif : ${doc.rejectionReason}',
                  style: const TextStyle(
                      fontSize: 12.5,
                      color: TekaColors.destructive,
                      height: 1.35)),
            ],
          ],
          if (uploading) ...[
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                  value: progress > 0 && progress < 1 ? progress : null,
                  minHeight: 6),
            ),
            const SizedBox(height: 4),
            Text(
              progress >= 1
                  ? 'Vérification du fichier…'
                  : 'Envoi en cours… ${(progress * 100).round()} %',
              style: const TextStyle(
                  fontSize: 12, color: TekaColors.mutedForeground),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: 8),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.error_outline,
                    size: 18, color: TekaColors.destructive),
                const SizedBox(width: 6),
                Expanded(
                    child: Text(error!,
                        style: const TextStyle(
                            fontSize: 12.5,
                            color: TekaColors.destructive,
                            height: 1.35))),
              ],
            ),
          ],
          const SizedBox(height: 10),
          Align(
            alignment: Alignment.centerRight,
            child: doc == null || doc.status == 'REJECTED'
                ? FilledButton.icon(
                    onPressed: disabled ? null : onUpload,
                    icon: Icon(
                        error != null
                            ? Icons.refresh_rounded
                            : Icons.upload_file_outlined,
                        size: 18),
                    label: Text(error != null ? 'Réessayer' : buttonLabel),
                  )
                : OutlinedButton.icon(
                    onPressed: disabled ? null : onUpload,
                    icon: Icon(
                        error != null
                            ? Icons.refresh_rounded
                            : Icons.upload_file_outlined,
                        size: 18),
                    label: Text(error != null ? 'Réessayer' : buttonLabel),
                  ),
          ),
        ],
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorState({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline,
                color: TekaColors.tekaRed, size: 42),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: TekaColors.mutedForeground)),
            const SizedBox(height: 16),
            FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
          ],
        ),
      ),
    );
  }
}
