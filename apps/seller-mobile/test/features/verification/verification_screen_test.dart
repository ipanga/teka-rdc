import 'dart:async';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:seller_mobile/core/theme/app_theme.dart';
import 'package:seller_mobile/features/verification/data/verification_repository.dart';
import 'package:seller_mobile/features/verification/presentation/screens/verification_screen.dart';

const _limits = {
  'maxSizeBytes': 5 * 1024 * 1024,
  'acceptedMimeTypes': ['application/pdf', 'image/jpeg', 'image/png']
};
final _pdf = Uint8List.fromList('%PDF-1.4\n%%EOF\n'.codeUnits);

Map<String, dynamic> _status({
  String status = 'NOT_SUBMITTED',
  String businessType = 'individual',
  List<Map<String, dynamic>> documents = const [],
  String? note,
}) {
  final required = businessType == 'company'
      ? ['RCCM', 'IDENTIFICATION_NATIONALE', 'IDENTITY_DOCUMENT']
      : ['IDENTITY_DOCUMENT'];
  final live = documents
      .where((d) => d['status'] == 'PENDING' || d['status'] == 'ACCEPTED')
      .map((d) => d['type'])
      .toSet();
  return {
    'verificationStatus': status,
    'businessType': businessType,
    'verificationNote': note,
    'requiredTypes': required,
    'missingTypes': required.where((t) => !live.contains(t)).toList(),
    'limits': _limits,
    'documents': documents,
  };
}

class _Repo extends VerificationRepository {
  _Repo(this.current, {this.failUpload = false}) : super(Dio());
  Map<String, dynamic> current;
  bool failUpload;
  final uploads = <Map<String, Object?>>[];
  int uploadCalls = 0;

  @override
  Future<VerificationStatusModel> getStatus() async =>
      VerificationStatusModel.fromJson(current);

  @override
  Future<VerificationStatusModel> uploadDocument({
    required String type,
    String? label,
    required Uint8List bytes,
    required String filename,
    required String mimeType,
    void Function(int sent, int total)? onProgress,
  }) async {
    uploadCalls++;
    uploads.add(
        {'type': type, 'label': label, 'mime': mimeType, 'size': bytes.length});
    onProgress?.call(50, 100);
    if (failUpload) {
      throw DioException(
        requestOptions:
            RequestOptions(path: '/v1/sellers/verification/documents'),
        type: DioExceptionType.badResponse,
        response: Response(
          requestOptions:
              RequestOptions(path: '/v1/sellers/verification/documents'),
          statusCode: 400,
          data: {
            'success': false,
            'error': {
              'status': 400,
              'message':
                  'Le contenu du fichier ne correspond pas à son format déclaré'
            }
          },
        ),
      );
    }
    // The API answers with the new authoritative status (D5 for VERIFIED).
    final docs = [
      ...(current['documents'] as List)
          .cast<Map<String, dynamic>>()
          .where((d) => d['type'] != type),
      {
        'id': 'new-$type',
        'type': type,
        'label': label,
        'status': 'PENDING',
        'mimeType': mimeType,
        'sizeBytes': bytes.length
      },
    ];
    final wasVerified = current['verificationStatus'] == 'VERIFIED';
    current = _status(
        status: wasVerified ? 'PENDING_REVIEW' : 'PENDING_REVIEW',
        businessType: current['businessType'] as String,
        documents: docs);
    return VerificationStatusModel.fromJson(current);
  }
}

Future<void> _pump(WidgetTester tester, _Repo repo,
    {Future<PickedDocument?> Function(String)? pick}) async {
  // Tall phone viewport so every tile is built (ListView is lazy).
  tester.view.physicalSize = const Size(1200, 4000);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(ProviderScope(
    overrides: [verificationRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp(
        theme: AppTheme.lightTheme,
        home: VerificationScreen(pickOverride: pick)),
  ));
  await tester.pump();
  await tester.pump();
}

void main() {
  testWidgets(
      'NOT_SUBMITTED individual: one required document, formats + server limit, add button',
      (tester) async {
    await _pump(tester, _Repo(_status()));
    expect(find.text('Non vérifié'), findsOneWidget);
    expect(find.text('Document requis'), findsOneWidget);
    expect(find.textContaining('5 Mo maximum'), findsOneWidget);
    expect(find.text("Pièce d'identité"), findsOneWidget);
    expect(find.text('RCCM'), findsNothing,
        reason: 'an individual is never asked for the RCCM');
    expect(find.text('Il manque 1 document pour lancer la vérification.'),
        findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Ajouter'), findsNWidgets(2),
        reason: 'the required document + « Autre »');
    expect(find.text('Autre document officiel'), findsOneWidget);
    expect(find.text('Identification Nationale'), findsNothing);
  });

  testWidgets('company: the three required documents from the API, in order',
      (tester) async {
    await _pump(tester, _Repo(_status(businessType: 'company')));
    expect(find.text('Documents requis pour une entreprise'), findsOneWidget);
    expect(find.text('RCCM'), findsOneWidget);
    expect(find.text('Identification Nationale'), findsOneWidget);
    // ignore: avoid_print
    print(
        'DBG2: ${tester.widgetList<Text>(find.byType(Text)).map((t) => t.data).toList()}');
    expect(find.text("Pièce d'identité"), findsOneWidget);
    expect(find.text('Requis'), findsNWidgets(3));
    expect(find.text('Il manque 3 documents pour lancer la vérification.'),
        findsOneWidget);
  });

  testWidgets(
      'upload: valid PDF → progress → API status PENDING_REVIEW rendered; a second tap while the picker is open is ignored',
      (tester) async {
    final repo = _Repo(_status());
    final picker = Completer<PickedDocument?>();
    var pickCalls = 0;
    await _pump(tester, repo, pick: (_) {
      pickCalls++;
      return picker.future;
    });
    await tester.tap(find.widgetWithText(FilledButton, 'Ajouter').first);
    await tester.pump();
    // Second tap while the native picker is still open.
    await tester.tap(find.widgetWithText(FilledButton, 'Ajouter').first,
        warnIfMissed: false);
    await tester.pump();
    picker.complete(PickedDocument(_pdf, 'cni.pdf', 'application/pdf'));
    await tester.pumpAndSettle();
    expect(pickCalls, 1);
    expect(repo.uploadCalls, 1);
    expect(repo.uploads.single['mime'], 'application/pdf');
    expect(find.text('En attente de vérification'), findsOneWidget);
    expect(
        find.textContaining('En cours de vérification · PDF'), findsOneWidget);
    expect(
        find.text(
            'Document envoyé — vos documents sont en cours de vérification.'),
        findsOneWidget);
  });

  testWidgets(
      'invalid file is refused locally with the French message; nothing is sent',
      (tester) async {
    final repo = _Repo(_status());
    await _pump(tester, repo,
        pick: (_) async => PickedDocument(
            Uint8List.fromList('MZ......'.codeUnits),
            'x.exe',
            'application/pdf'));
    await tester.tap(find.widgetWithText(FilledButton, 'Ajouter').first);
    await tester.pumpAndSettle();
    expect(repo.uploadCalls, 0);
    expect(find.text('Format non supporté. Formats acceptés : PDF, JPEG, PNG.'),
        findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Réessayer'), findsOneWidget);
  });

  testWidgets('oversized file is refused locally against the server limit',
      (tester) async {
    final repo = _Repo(_status());
    final big = Uint8List(5 * 1024 * 1024 + 1)
      ..setRange(0, 8, '%PDF-1.4'.codeUnits);
    await _pump(tester, repo,
        pick: (_) async => PickedDocument(big, 'big.pdf', 'application/pdf'));
    await tester.tap(find.widgetWithText(FilledButton, 'Ajouter').first);
    await tester.pumpAndSettle();
    expect(repo.uploadCalls, 0);
    expect(find.text('Le fichier dépasse 5 Mo.'), findsOneWidget);
  });

  testWidgets('API refusal is shown verbatim with a retry', (tester) async {
    final repo = _Repo(_status(), failUpload: true);
    await _pump(tester, repo,
        pick: (_) async => PickedDocument(_pdf, 'cni.pdf', 'application/pdf'));
    await tester.tap(find.widgetWithText(FilledButton, 'Ajouter').first);
    await tester.pumpAndSettle();
    expect(
        find.text(
            'Le contenu du fichier ne correspond pas à son format déclaré'),
        findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Réessayer'), findsOneWidget);
    expect(find.text('Non vérifié'), findsOneWidget,
        reason: 'status unchanged on failure');
  });

  testWidgets(
      'PENDING_REVIEW: status + the pending document, replace stays available',
      (tester) async {
    await _pump(
        tester,
        _Repo(_status(status: 'PENDING_REVIEW', documents: [
          {
            'id': 'd',
            'type': 'IDENTITY_DOCUMENT',
            'status': 'PENDING',
            'mimeType': 'image/jpeg',
            'sizeBytes': 120000
          },
        ])));
    expect(find.text('En attente de vérification'), findsOneWidget);
    expect(find.textContaining('En cours de vérification · JPEG, 117 Ko'),
        findsOneWidget);
    expect(find.widgetWithText(OutlinedButton, 'Remplacer'), findsOneWidget);
  });

  testWidgets(
      'VERIFIED: replacing a required document warns, then the API PENDING_REVIEW replaces the badge',
      (tester) async {
    final repo = _Repo(_status(status: 'VERIFIED', documents: [
      {
        'id': 'd',
        'type': 'IDENTITY_DOCUMENT',
        'status': 'ACCEPTED',
        'mimeType': 'image/png',
        'sizeBytes': 1000
      },
    ]));
    await _pump(tester, repo,
        pick: (_) async => PickedDocument(_pdf, 'cni.pdf', 'application/pdf'));
    expect(find.text('Vérifié'), findsOneWidget);
    expect(find.textContaining('Accepté · PNG'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Remplacer'));
    await tester.pumpAndSettle();
    expect(find.text('Remplacer ce document ?'), findsOneWidget);
    expect(find.textContaining('repassera « En attente de vérification »'),
        findsOneWidget);
    await tester.tap(find.widgetWithText(TextButton, 'Annuler'));
    await tester.pumpAndSettle();
    expect(repo.uploadCalls, 0);
    expect(find.text('Vérifié'), findsOneWidget);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Remplacer'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Remplacer').last);
    await tester.pumpAndSettle();
    expect(repo.uploadCalls, 1);
    expect(find.text('Vérifié'), findsNothing);
    expect(find.text('En attente de vérification'), findsOneWidget);
  });

  testWidgets(
      'REJECTED: the admin reason, the rejected document, an obvious re-submission path, account not suspended',
      (tester) async {
    await _pump(
        tester,
        _Repo(
            _status(status: 'REJECTED', note: 'Document illisible', documents: [
          {
            'id': 'd',
            'type': 'IDENTITY_DOCUMENT',
            'status': 'REJECTED',
            'mimeType': 'image/jpeg',
            'sizeBytes': 1000,
            'rejectionReason': 'Document illisible'
          },
        ])));
    expect(find.text('Vérification refusée'), findsOneWidget);
    expect(find.text('Motif de Teka RDC : Document illisible'), findsOneWidget);
    expect(find.textContaining('reste active'), findsOneWidget);
    expect(find.textContaining('Refusé · JPEG'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Remplacer'), findsOneWidget);
  });

  testWidgets('OTHER asks for a label first and sends it', (tester) async {
    final repo = _Repo(_status());
    await _pump(tester, repo,
        pick: (_) async =>
            PickedDocument(_pdf, 'patente.pdf', 'application/pdf'));
    await tester.tap(find.widgetWithText(FilledButton, 'Ajouter').last);
    await tester.pumpAndSettle();
    // ignore: avoid_print
    print(
        'DBG3: ${tester.widgetList<Text>(find.byType(Text)).map((t) => t.data).toList()} EXC=${tester.takeException()}');
    expect(find.text('Quel document ?'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Patente 2026');
    await tester.tap(find.widgetWithText(FilledButton, 'Continuer'));
    await tester.pumpAndSettle();
    expect(repo.uploads.single['type'], 'OTHER');
    expect(repo.uploads.single['label'], 'Patente 2026');
  });
}
