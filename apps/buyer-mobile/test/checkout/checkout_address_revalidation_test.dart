// PR D2 (2026-09-07) — the API snapshots the address row at checkout; if the
// row changed since the screen loaded (website, another device), the order
// must not be placed against an address the buyer has not seen.
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/cart/data/cart_repository.dart';
import 'package:buyer_mobile/features/checkout/data/checkout_repository.dart';
import 'package:buyer_mobile/features/checkout/data/models/checkout_model.dart';
import 'package:buyer_mobile/features/checkout/presentation/providers/checkout_provider.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../session/fake_auth.dart';

AddressModel _addr({String avenue = 'Av. QA 12', String phone = '+243990000001'}) =>
    AddressModel(
      id: 'addr-1',
      province: 'Haut-Katanga',
      town: 'Lubumbashi',
      neighborhood: 'Kampemba',
      avenue: avenue,
      recipientName: 'QA Avis',
      recipientPhone: phone,
      cityId: 'c1',
      communeId: 'k1',
      isDefault: true,
    );

class _Repo extends CheckoutRepository {
  _Repo() : super(Dio());
  List<AddressModel> addresses = [_addr()];
  bool getAddressesFails = false;
  int checkouts = 0;

  @override
  Future<List<AddressModel>> getAddresses() async {
    if (getAddressesFails) {
      throw DioException(requestOptions: RequestOptions(path: '/v1/addresses'), type: DioExceptionType.connectionError);
    }
    return addresses;
  }

  @override
  Future<CheckoutQuote> getQuote(String deliveryAddressId) async => const CheckoutQuote(
        subtotalCDF: '0', deliveryFeeCDF: '0', totalCDF: '0', deliveryAvailable: true);

  @override
  Future<CheckoutResponse> checkout(CheckoutRequest request) async {
    checkouts++;
    throw StateError('stop here');
  }
}

Future<void> _settle() async {
  for (var i = 0; i < 6; i++) {
    await Future<void>.delayed(Duration.zero);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  late _Repo repo;
  late ProviderContainer container;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    repo = _Repo();
    container = ProviderContainer(overrides: [
      sharedPreferencesProvider.overrideWithValue(prefs),
      typedCacheProvider.overrideWithValue(TypedCache(prefs)),
      checkoutRepositoryProvider.overrideWithValue(repo),
      cartRepositoryProvider.overrideWithValue(CartRepository(Dio())),
      authProvider.overrideWith((ref) => FakeAuthNotifier.signedIn('me')),
    ]);
    addTearDown(container.dispose);
    container.listen(checkoutProvider, (_, __) {}, fireImmediately: true);
    await _settle();
    expect(container.read(checkoutProvider).selectedAddress?.avenue, 'Av. QA 12');
  });

  test('address edited elsewhere → order NOT placed, address refreshed, buyer told', () async {
    repo.addresses = [_addr(avenue: 'Av. Mobutu 3', phone: '+243810000001')];
    final ok = await container.read(checkoutProvider.notifier).placeOrder();
    final s = container.read(checkoutProvider);
    expect(ok, isFalse);
    expect(repo.checkouts, 0);
    expect(s.selectedAddress?.avenue, 'Av. Mobutu 3');
    expect(s.selectedAddress?.recipientPhone, '+243810000001');
    expect(s.error, contains('a été modifiée'));
  });

  test('address deleted elsewhere → not placed, buyer told', () async {
    repo.addresses = [];
    final ok = await container.read(checkoutProvider.notifier).placeOrder();
    expect(ok, isFalse);
    expect(repo.checkouts, 0);
    expect(container.read(checkoutProvider).error, contains("n'existe plus"));
  });

  test('unchanged address → placement proceeds (the re-read is transparent)', () async {
    await container.read(checkoutProvider.notifier).placeOrder();
    expect(repo.checkouts, 1);
  });

  test('re-read unreachable → placement still attempted (offline must not block a correct address)', () async {
    repo.getAddressesFails = true;
    await container.read(checkoutProvider.notifier).placeOrder();
    expect(repo.checkouts, 1);
  });
}
