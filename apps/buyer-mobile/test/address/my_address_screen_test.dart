// « Mon adresse » — PR D2 (2026-09-07): fetched fresh per account (no address
// of A ever shown to B), error state with retry, and the API's reason surfaced
// through the sheet's save handler.
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/features/checkout/data/checkout_repository.dart';
import 'package:buyer_mobile/features/checkout/data/models/checkout_model.dart';
import 'package:buyer_mobile/features/city/data/city_repository.dart';
import 'package:buyer_mobile/features/profile/presentation/screens/my_address_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _Repo extends CheckoutRepository {
  _Repo() : super(Dio());
  /// The server's answer for the CURRENT session.
  List<AddressModel> current = const [];
  bool fail = false;
  @override
  Future<List<AddressModel>> getAddresses() async {
    if (fail) {
      throw DioException(requestOptions: RequestOptions(path: '/v1/addresses'), type: DioExceptionType.connectionError);
    }
    return current;
  }

  @override
  Future<AddressModel> updateAddress(String id, Map<String, dynamic> data) async {
    throw DioException(
      requestOptions: RequestOptions(path: '/v1/addresses/$id'),
      type: DioExceptionType.badResponse,
      response: Response(requestOptions: RequestOptions(path: '/v1/addresses/$id'), statusCode: 400, data: {
        'success': false,
        'error': {'status': 400, 'message': 'Commune inactive'},
      }),
    );
  }
}

AddressModel _addr(String who) => AddressModel(
      id: 'addr-$who',
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kampemba',
      avenue: 'Av. $who 12',
      recipientName: 'Buyer $who',
      recipientPhone: who == 'A' ? '+243990000001' : '+243810000002',
      cityId: 'c1',
      communeId: 'k1',
      isDefault: true,
    );

Future<void> _pump(WidgetTester tester, _Repo repo) async {
  await tester.pumpWidget(ProviderScope(
    overrides: [
      checkoutRepositoryProvider.overrideWithValue(repo),
      cityRepositoryProvider.overrideWithValue(CityRepository(Dio())),
    ],
    child: const MaterialApp(home: MyAddressScreen()),
  ));
  await tester.pumpAndSettle();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  testWidgets('account isolation: B never sees A, and A is refetched when they come back', (tester) async {
    final repo = _Repo()..current = [_addr('A')];
    await _pump(tester, repo);
    expect(find.textContaining('Av. A 12'), findsOneWidget);
    expect(find.textContaining('+243990000001'), findsOneWidget);

    // A logs out, B logs in and opens the screen (a new route instance).
    repo.current = [_addr('B')];
    await tester.pumpWidget(const SizedBox());
    await _pump(tester, repo);
    expect(find.textContaining('Av. A 12'), findsNothing);
    expect(find.textContaining('+243990000001'), findsNothing);
    expect(find.textContaining('Av. B 12'), findsOneWidget);

    repo.current = [_addr('A')];
    await tester.pumpWidget(const SizedBox());
    await _pump(tester, repo);
    expect(find.textContaining('Av. A 12'), findsOneWidget);
  });

  testWidgets('load failure → French error + retry; success afterwards', (tester) async {
    final repo = _Repo()
      ..fail = true
      ..current = [_addr('A')];
    await _pump(tester, repo);
    expect(find.text('Impossible de charger votre adresse.'), findsOneWidget);
    repo.fail = false;
    await tester.tap(find.text('Réessayer'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Av. A 12'), findsOneWidget);
  });
}
