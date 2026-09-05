import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../../core/theme/teka_colors.dart';

/// Seller-facing verification vocabulary — one source for the account tile,
/// the verification screen and tests. Natural French, no enum names, and the
/// « Vérifié » wording never implies a government certification or any
/// guarantee (D5). Mirrors seller-web `lib/verification.ts`.
class VerificationStatusUi {
  const VerificationStatusUi._(this.label, this.hint, this.color, this.icon);

  final String label;
  final String hint;
  final Color color;
  final IconData icon;

  static VerificationStatusUi of(String status) {
    switch (status.toUpperCase()) {
      case 'PENDING_REVIEW':
        return const VerificationStatusUi._(
          'En attente de vérification',
          "Teka RDC examine les documents que vous avez fournis. Vous serez informé du résultat ; aucune action n'est requise.",
          TekaColors.warning,
          Icons.hourglass_top_rounded,
        );
      case 'VERIFIED':
        return const VerificationStatusUi._(
          'Vérifié',
          'Teka RDC a examiné vos documents justificatifs. Le badge « Vérifié » apparaît sur vos fiches produits ; il signifie uniquement que Teka a examiné ces documents.',
          TekaColors.success,
          Icons.verified_rounded,
        );
      case 'REJECTED':
        return const VerificationStatusUi._(
          'Vérification refusée',
          "Vos documents n'ont pas pu être validés. Votre boutique reste active : soumettez de nouveaux documents pour une nouvelle vérification.",
          TekaColors.destructive,
          Icons.error_outline_rounded,
        );
      default:
        return const VerificationStatusUi._(
          'Non vérifié',
          'Fournissez vos documents justificatifs pour que Teka RDC les examine et affiche le badge « Vérifié » sur votre boutique.',
          TekaColors.mutedForeground,
          Icons.shield_outlined,
        );
    }
  }
}

/// Document types as the seller reads them.
class DocumentTypeUi {
  const DocumentTypeUi._(this.label, this.hint);
  final String label;
  final String hint;

  static const order = [
    'RCCM',
    'IDENTIFICATION_NATIONALE',
    'IDENTITY_DOCUMENT',
    'OTHER'
  ];

  static DocumentTypeUi of(String type) {
    switch (type) {
      case 'RCCM':
        return const DocumentTypeUi._(
          'RCCM',
          "Registre du commerce et du crédit mobilier de l'entreprise.",
        );
      case 'IDENTIFICATION_NATIONALE':
        return const DocumentTypeUi._(
          'Identification Nationale',
          "Numéro d'identification nationale délivré à l'entreprise.",
        );
      case 'IDENTITY_DOCUMENT':
        return const DocumentTypeUi._(
          "Pièce d'identité",
          "Carte d'électeur, passeport ou permis du responsable de la boutique.",
        );
      default:
        return const DocumentTypeUi._(
          'Autre document officiel',
          'Patente, attestation ou tout autre justificatif utile (facultatif).',
        );
    }
  }
}

/// Per-document review state, in the seller's words.
class DocumentStatusUi {
  const DocumentStatusUi._(this.label, this.color, this.icon);
  final String label;
  final Color color;
  final IconData icon;

  static DocumentStatusUi of(String status) {
    switch (status.toUpperCase()) {
      case 'ACCEPTED':
        return const DocumentStatusUi._(
            'Accepté', TekaColors.success, Icons.check_circle_rounded);
      case 'REJECTED':
        return const DocumentStatusUi._(
            'Refusé', TekaColors.destructive, Icons.cancel_rounded);
      case 'PENDING':
        return const DocumentStatusUi._('En cours de vérification',
            TekaColors.warning, Icons.schedule_rounded);
      default:
        return const DocumentStatusUi._(
            'Remplacé', TekaColors.mutedForeground, Icons.history_rounded);
    }
  }
}

/// Client-side pre-check mirroring the API's magic-byte rule, so the seller
/// gets an immediate French message before any bytes travel. The API stays
/// authoritative and re-checks everything.
String? sniffDocumentMime(Uint8List bytes) {
  if (bytes.length < 8) return null;
  if (bytes[0] == 0x25 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x44 &&
      bytes[3] == 0x46 &&
      bytes[4] == 0x2d) {
    return 'application/pdf';
  }
  if (bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff)
    return 'image/jpeg';
  if (bytes[0] == 0x89 &&
      bytes[1] == 0x50 &&
      bytes[2] == 0x4e &&
      bytes[3] == 0x47) return 'image/png';
  return null;
}

/// French pre-upload validation. Null = OK.
String? validateDocumentBytes(
  Uint8List bytes, {
  required int maxSizeBytes,
  required List<String> acceptedMimeTypes,
}) {
  if (bytes.isEmpty) return 'Le fichier est vide.';
  if (bytes.length > maxSizeBytes) {
    return 'Le fichier dépasse ${(maxSizeBytes / (1024 * 1024)).round()} Mo.';
  }
  final mime = sniffDocumentMime(bytes);
  if (mime == null || !acceptedMimeTypes.contains(mime)) {
    return 'Format non supporté. Formats acceptés : PDF, JPEG, PNG.';
  }
  return null;
}

String documentFileLabel(String mimeType) {
  switch (mimeType) {
    case 'application/pdf':
      return 'PDF';
    case 'image/png':
      return 'PNG';
    default:
      return 'JPEG';
  }
}

String formatFileSize(int bytes) {
  if (bytes >= 1024 * 1024)
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1).replaceAll('.', ',')} Mo';
  if (bytes >= 1024) return '${(bytes / 1024).round()} Ko';
  return '$bytes o';
}
