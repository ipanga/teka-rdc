import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/features/verification/presentation/verification_status.dart';
import 'package:seller_mobile/features/verification/data/verification_repository.dart';

void main() {
  group('VerificationStatusUi — natural French, no enum names, no over-claim',
      () {
    test('four states', () {
      expect(VerificationStatusUi.of('NOT_SUBMITTED').label, 'Non vérifié');
      expect(VerificationStatusUi.of('PENDING_REVIEW').label,
          'En attente de vérification');
      expect(VerificationStatusUi.of('VERIFIED').label, 'Vérifié');
      expect(VerificationStatusUi.of('REJECTED').label, 'Vérification refusée');
      expect(VerificationStatusUi.of('garbage').label, 'Non vérifié');
      for (final s in [
        'NOT_SUBMITTED',
        'PENDING_REVIEW',
        'VERIFIED',
        'REJECTED'
      ]) {
        final hint = VerificationStatusUi.of(s).hint.toLowerCase();
        expect(hint.contains('gouvernement'), isFalse);
        expect(hint.contains('garanti'), isFalse);
        expect(hint.contains('certifi'), isFalse);
        expect(hint.contains('_'), isFalse,
            reason: 'no enum name leaks into copy');
      }
      expect(VerificationStatusUi.of('VERIFIED').hint,
          contains('uniquement que Teka a examiné'));
      expect(
          VerificationStatusUi.of('REJECTED').hint, contains('reste active'));
    });
  });

  group('client pre-check mirrors the API rule', () {
    final pdf = Uint8List.fromList('%PDF-1.4\n%%EOF\n'.codeUnits);
    final png = Uint8List.fromList(
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    final jpg = Uint8List.fromList([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0]);
    final exe = Uint8List.fromList('MZ......'.codeUnits);
    const accepted = ['application/pdf', 'image/jpeg', 'image/png'];
    test('sniff', () {
      expect(sniffDocumentMime(pdf), 'application/pdf');
      expect(sniffDocumentMime(png), 'image/png');
      expect(sniffDocumentMime(jpg), 'image/jpeg');
      expect(sniffDocumentMime(exe), isNull);
    });
    test('size + format messages', () {
      expect(
          validateDocumentBytes(pdf,
              maxSizeBytes: 5 * 1024 * 1024, acceptedMimeTypes: accepted),
          isNull);
      expect(
          validateDocumentBytes(exe,
              maxSizeBytes: 5 * 1024 * 1024, acceptedMimeTypes: accepted),
          'Format non supporté. Formats acceptés : PDF, JPEG, PNG.');
      expect(
          validateDocumentBytes(pdf,
              maxSizeBytes: 4, acceptedMimeTypes: accepted),
          'Le fichier dépasse 0 Mo.');
      expect(
          validateDocumentBytes(Uint8List(0),
              maxSizeBytes: 10, acceptedMimeTypes: accepted),
          'Le fichier est vide.');
    });
  });

  group('VerificationStatusModel', () {
    test(
        'parses the API payload, exposes server limits and the current document per type',
        () {
      final m = VerificationStatusModel.fromJson({
        'verificationStatus': 'PENDING_REVIEW',
        'businessType': 'company',
        'requiredTypes': [
          'RCCM',
          'IDENTIFICATION_NATIONALE',
          'IDENTITY_DOCUMENT'
        ],
        'missingTypes': [],
        'limits': {
          'maxSizeBytes': 5 * 1024 * 1024,
          'acceptedMimeTypes': ['application/pdf', 'image/jpeg', 'image/png']
        },
        'documents': [
          {
            'id': 'new',
            'type': 'RCCM',
            'status': 'PENDING',
            'mimeType': 'application/pdf',
            'sizeBytes': 303,
            'submittedAt': '2026-09-05T10:00:00Z'
          },
          {
            'id': 'old',
            'type': 'RCCM',
            'status': 'SUPERSEDED',
            'mimeType': 'application/pdf',
            'sizeBytes': 303
          },
        ],
      });
      expect(m.limits.maxSizeMb, 5);
      expect(m.documentOf('RCCM')!.id, 'new');
      expect(m.documentOf('OTHER'), isNull);
      expect(m.requiredTypes.length, 3);
    });
    test('never carries a storage identifier', () {
      final json = {
        'id': 'd',
        'type': 'RCCM',
        'status': 'PENDING',
        'mimeType': 'application/pdf',
        'sizeBytes': 1,
        'cloudinaryId': 'leak'
      };
      final d = SellerDocumentView.fromJson(json);
      expect(d.toString().contains('leak'), isFalse);
    });
  });
}
