// Ratings — A8 and the other review findings of the pre-scale audit
// (2026-09-06): a failed submit / edit / delete is shown and never blows the
// list away; the buyer's own review is rendered once; an emptied comment is
// cleared on edit; the sheet lets a nameless buyer know how they will appear.
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/reviews/data/models/review_model.dart';
import 'package:buyer_mobile/features/reviews/data/reviews_repository.dart';
import 'package:buyer_mobile/features/reviews/presentation/providers/reviews_provider.dart';
import 'package:buyer_mobile/features/reviews/presentation/screens/product_reviews_screen.dart';
import 'package:buyer_mobile/features/reviews/presentation/widgets/review_form_dialog.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../session/fake_auth.dart';

ReviewModel _review(String id, String buyerId, {String? text, String? title}) =>
    ReviewModel(
      id: id,
      productId: 'p1',
      buyerId: buyerId,
      orderId: 'o1',
      rating: 4,
      title: title ?? 'Titre $id',
      text: text ?? 'Texte $id',
      status: 'ACTIVE',
      createdAt: '2026-09-01T10:00:00.000Z',
      buyer: ReviewBuyerModel(id: buyerId, firstName: 'B$buyerId'),
    );

DioException _apiError(int status, String message) {
  final o = RequestOptions(path: '/v1/reviews');
  return DioException(
    requestOptions: o,
    type: DioExceptionType.badResponse,
    response: Response(requestOptions: o, statusCode: status, data: {
      'success': false,
      'error': {'status': status, 'message': message},
    }),
  );
}

/// Scripted repository: the list is the API's (it INCLUDES the caller's own
/// review, as the real endpoint does); mutations succeed or fail on demand.
class _Repo extends ReviewsRepository {
  _Repo() : super(Dio());
  List<ReviewModel> list = [];
  ReviewModel? mine;
  bool eligible = false;
  Object? failNext;
  bool listFails = false;
  final sentUpdates = <Map<String, dynamic>>[];

  @override
  Future<PaginatedReviewsResponse> getProductReviews(String productId,
      {int page = 1, int limit = 10, String sort = 'newest'}) async {
    if (listFails) throw _apiError(500, 'boom');
    return PaginatedReviewsResponse(data: list, page: page, limit: limit, total: list.length, totalPages: 1);
  }

  @override
  Future<ReviewStatsModel> getReviewStats(String productId) async =>
      ReviewStatsModel(avgRating: 4, totalReviews: list.length, distribution: const {});

  @override
  Future<ReviewModel?> getMyReview(String productId) async => mine;

  @override
  Future<CanReviewModel> canReview(String productId) async =>
      CanReviewModel(canReview: eligible, orderId: eligible ? 'o1' : null);

  Future<T> _mutate<T>(T Function() ok) async {
    final f = failNext;
    if (f != null) {
      failNext = null;
      throw f;
    }
    return ok();
  }

  @override
  Future<ReviewModel> createReview({required String productId, required String orderId, required int rating, required String title, String? text}) =>
      _mutate(() {
        mine = _review('new', 'me', title: title, text: text);
        list = [...list, mine!];
        return mine!;
      });

  @override
  Future<ReviewModel> updateReview({required String reviewId, required int rating, required String title, String? text}) =>
      _mutate(() {
        sentUpdates.add({'rating': rating, 'title': title, 'text': text});
        mine = _review(reviewId, 'me', title: title, text: text);
        list = [for (final r in list) r.id == reviewId ? mine! : r];
        return mine!;
      });

  @override
  Future<void> deleteReview(String id) => _mutate(() {
        list = list.where((r) => r.id != id).toList();
        mine = null;
      });
}

Future<void> _settle() async {
  for (var i = 0; i < 6; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ReviewsNotifier — a failed mutation never blows the list away', () {
    late _Repo repo;
    late ProviderContainer container;

    setUp(() async {
      repo = _Repo()
        ..list = [_review('r1', 'other'), _review('r2', 'me')]
        ..mine = _review('r2', 'me');
      container = ProviderContainer(overrides: [reviewsRepositoryProvider.overrideWithValue(repo)]);
      addTearDown(container.dispose);
      container.listen(reviewsProvider('p1'), (_, __) {}, fireImmediately: true);
      await _settle();
      expect(container.read(reviewsProvider('p1')).reviews.length, 2);
    });

    test('edit rejected by the API → mutationError set, list + own review intact, load error untouched', () async {
      repo.failNext = _apiError(400, 'Le titre doit contenir au moins 5 caractères');
      final ok = await container.read(reviewsProvider('p1').notifier).updateReview(reviewId: 'r2', rating: 5, title: 'Bof', text: '');
      final s = container.read(reviewsProvider('p1'));
      expect(ok, isFalse);
      expect(s.mutationError, 'Le titre doit contenir au moins 5 caractères');
      expect(s.error, isNull);
      expect(s.reviews.length, 2);
      expect(s.myReview?.id, 'r2');
      expect(s.isSubmitting, isFalse);
    });

    test('delete failure → mutationError, review still listed; clearMutationError forgets it', () async {
      repo.failNext = _apiError(403, 'Vous ne pouvez supprimer que vos propres avis');
      final ok = await container.read(reviewsProvider('p1').notifier).deleteReview('r2');
      expect(ok, isFalse);
      expect(container.read(reviewsProvider('p1')).mutationError, contains('supprimer'));
      expect(container.read(reviewsProvider('p1')).reviews.length, 2);
      container.read(reviewsProvider('p1').notifier).clearMutationError();
      expect(container.read(reviewsProvider('p1')).mutationError, isNull);
    });

    test('offline submit → connectivity message, nothing lost', () async {
      repo.failNext = DioException(requestOptions: RequestOptions(path: '/v1/reviews'), type: DioExceptionType.connectionError);
      final ok = await container.read(reviewsProvider('p1').notifier).submitReview(orderId: 'o1', rating: 5, title: 'Très bien');
      expect(ok, isFalse);
      expect(container.read(reviewsProvider('p1')).mutationError, contains('connexion'));
      expect(container.read(reviewsProvider('p1')).reviews.length, 2);
    });

    test('a successful edit with an emptied comment sends text "" so the API clears it', () async {
      final ok = await container.read(reviewsProvider('p1').notifier).updateReview(reviewId: 'r2', rating: 3, title: 'Correct', text: '');
      expect(ok, isTrue);
      expect(repo.sentUpdates.single['text'], '');
      expect(container.read(reviewsProvider('p1')).mutationError, isNull);
    });
  });

  test('ReviewsRepository.updateReview always sends `text` (empty string clears the comment)', () async {
    Map<String, dynamic>? sent;
    final dio = Dio()
      ..interceptors.add(InterceptorsWrapper(onRequest: (o, h) {
        sent = Map<String, dynamic>.from(o.data as Map);
        h.resolve(Response(requestOptions: o, statusCode: 200, data: {
          'success': true,
          'data': {'id': 'r2', 'rating': 3, 'title': 'Correct', 'text': null, 'status': 'ACTIVE'},
        }));
      }));
    final repo = ReviewsRepository(dio);
    await repo.updateReview(reviewId: 'r2', rating: 3, title: 'Correct', text: '');
    expect(sent!['text'], '');
    await repo.updateReview(reviewId: 'r2', rating: 3, title: 'Correct', text: null);
    expect(sent!['text'], '');
    await repo.updateReview(reviewId: 'r2', rating: 3, title: 'Correct', text: 'Gardé');
    expect(sent!['text'], 'Gardé');
  });

  group('ProductReviewsScreen', () {
    Future<_Repo> pump(WidgetTester tester, {required _Repo repo, required FakeAuthNotifier auth}) async {
      await tester.pumpWidget(ProviderScope(
        overrides: [
          reviewsRepositoryProvider.overrideWithValue(repo),
          authProvider.overrideWith((ref) => auth),
        ],
        child: const MaterialApp(home: ProductReviewsScreen(productId: 'p1')),
      ));
      await tester.pumpAndSettle();
      return repo;
    }

    testWidgets('the buyer\'s own review is rendered once, under « Votre avis », others under the list', (tester) async {
      final repo = _Repo()
        ..list = [_review('r1', 'other'), _review('r2', 'me')]
        ..mine = _review('r2', 'me');
      await pump(tester, repo: repo, auth: FakeAuthNotifier.signedIn('me'));
      expect(find.text('Votre avis'), findsOneWidget);
      expect(find.text('Texte r2'), findsOneWidget, reason: 'own review exactly once');
      expect(find.text('Texte r1'), findsOneWidget);
      expect(find.textContaining('Tous les avis'), findsOneWidget);
    });

    testWidgets('a load failure with nothing loaded shows the error state with retry', (tester) async {
      final repo = _Repo()..listFails = true;
      await pump(tester, repo: repo, auth: FakeAuthNotifier.signedIn('me'));
      expect(find.text('Réessayer'), findsOneWidget);
      repo.listFails = false;
      repo.list = [_review('r1', 'other')];
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(find.text('Texte r1'), findsOneWidget);
    });

    testWidgets('delete: the dialog says « Annuler », a failed delete keeps the review and tells the buyer', (tester) async {
      final repo = _Repo()
        ..list = [_review('r2', 'me')]
        ..mine = _review('r2', 'me');
      await pump(tester, repo: repo, auth: FakeAuthNotifier.signedIn('me'));
      await tester.tap(find.byIcon(Icons.delete_outline));
      await tester.pumpAndSettle();
      expect(find.text('Annuler'), findsOneWidget);
      expect(find.text('Reinitialiser'), findsNothing);
      repo.failNext = _apiError(403, 'Vous ne pouvez supprimer que vos propres avis');
      await tester.tap(find.widgetWithText(FilledButton, "Supprimer l'avis"));
      await tester.pumpAndSettle();
      expect(find.text('Vous ne pouvez supprimer que vos propres avis'), findsOneWidget, reason: 'snackbar');
      expect(find.text('Texte r2'), findsOneWidget, reason: 'the review is still there');
    });

    testWidgets('submit rejected by the API: the sheet stays open with the message and the buyer\'s input', (tester) async {
      final repo = _Repo()..eligible = true;
      await pump(tester, repo: repo, auth: FakeAuthNotifier.signedIn('me'));
      await tester.tap(find.text('Écrire un avis'));
      await tester.pumpAndSettle();
      // 4 stars, a title, a comment.
      await tester.tap(find.bySemanticsLabel('4 étoiles'));
      await tester.enterText(find.byType(TextField).first, 'Très bon produit');
      await tester.enterText(find.byType(TextField).last, 'Livré vite');
      await tester.pumpAndSettle();
      repo.failNext = _apiError(400, 'Commande invalide ou ne contenant pas ce produit');
      await tester.tap(find.text("Publier l'avis"));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('review-submit-error')), findsOneWidget);
      expect(find.text('Commande invalide ou ne contenant pas ce produit'), findsOneWidget);
      expect(find.text('Très bon produit'), findsOneWidget, reason: 'input intact');
      expect(find.text('Réessayer'), findsOneWidget);
      // Retry succeeds → sheet closes, review listed once.
      await tester.tap(find.text('Réessayer'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('review-submit-error')), findsNothing);
      expect(find.text('Avis publié. Merci !'), findsOneWidget);
      expect(find.text('Livré vite'), findsOneWidget);
    });

    testWidgets('a nameless buyer is told the review is published as « Acheteur »; a named one is not', (tester) async {
      final repo = _Repo()..eligible = true;
      await pump(tester, repo: repo, auth: FakeAuthNotifier.signedIn('me'));
      await tester.tap(find.text('Écrire un avis'));
      await tester.pumpAndSettle();
      expect(find.textContaining('publié sous le nom'), findsOneWidget);
      expect(find.text('Ajouter mon nom'), findsOneWidget);
      expect(find.widgetWithText(TextField, '').evaluate().isNotEmpty, isTrue);
      final comment = tester.widget<TextField>(find.byType(TextField).last);
      expect(comment.maxLength, kReviewTextMax);
      expect(kReviewTextMax, 1000, reason: 'same cap as the API');
    });

    testWidgets('a named buyer sees no nameless notice', (tester) async {
      final repo = _Repo()..eligible = true;
      await pump(tester, repo: repo, auth: FakeAuthNotifier()..signIn('me', profile: {'firstName': 'Aline'}));
      await tester.tap(find.text('Écrire un avis'));
      await tester.pumpAndSettle();
      expect(find.textContaining('publié sous le nom'), findsNothing);
    });
  });
}
