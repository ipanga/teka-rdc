// Stale profile header (pre-scale audit, 2026-09-06): a name / photo edit must
// be visible on the account tab the moment the buyer comes back, and must be
// what an offline start restores — and none of it may survive a logout.
import 'package:buyer_mobile/core/cache/cache_keys.dart';
import 'package:buyer_mobile/core/cache/typed_cache.dart';
import 'package:buyer_mobile/core/config/flavor.dart';
import 'package:buyer_mobile/core/providers/core_providers.dart';
import 'package:buyer_mobile/features/auth/data/session_scope.dart';
import 'package:buyer_mobile/features/auth/presentation/providers/auth_provider.dart';
import 'package:buyer_mobile/features/catalog/data/recent_searches_store.dart';
import 'package:buyer_mobile/features/catalog/data/recently_viewed_store.dart';
import 'package:buyer_mobile/features/profile/data/profile_repository.dart';
import 'package:buyer_mobile/features/profile/presentation/screens/profile_screen.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../session/fake_auth.dart';

class _ProfileRepo extends ProfileRepository {
  _ProfileRepo(this.me) : super(Dio());
  BuyerProfile me;
  @override
  Future<BuyerProfile> getMe() async => me;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(FlavorConfig.initialize);

  group('AuthNotifier.updateUser', () {
    late SharedPreferences prefs;
    late SessionScope scope;
    late FakeAuthNotifier auth;

    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
      scope = SessionScope(TypedCache(prefs), RecentlyViewedStore(prefs), RecentSearchesStore());
      auth = FakeAuthNotifier(scope: scope);
    });

    test('merges the server answer into the session user and the offline cache', () async {
      auth.signIn('A', profile: {'firstName': null, 'avatar': null, 'phone': '+243999000101'});
      await auth.updateUser({'firstName': 'Aline', 'lastName': 'Kabila'});
      await auth.updateUser({'avatar': 'https://res.cloudinary.com/c/image/upload/v1/teka-rdc/avatars/a.webp'});
      final user = auth.state.user!;
      expect(user['firstName'], 'Aline');
      expect(user['lastName'], 'Kabila');
      expect(user['avatar'], endsWith('/avatars/a.webp'));
      expect(user['phone'], '+243999000101', reason: 'untouched fields are kept');
      expect(scope.readCachedProfile()?['firstName'], 'Aline', reason: 'offline start restores the edit');
    });

    test('is a no-op when signed out (nothing cached for nobody)', () async {
      await auth.updateUser({'firstName': 'Ghost'});
      expect(auth.state.user, isNull);
      expect(prefs.getString(CacheKeys.userProfile), isNull);
    });

    test('account isolation: A\'s edits do not survive logout and are invisible to B', () async {
      auth.signIn('A');
      await auth.updateUser({'firstName': 'Aline'});
      expect(prefs.getString(CacheKeys.userProfile), contains('Aline'));
      await auth.logout();
      expect(prefs.getString(CacheKeys.userProfile), isNull);
      expect(auth.state.user, isNull);
      auth.signIn('B');
      expect(auth.state.user!['firstName'], isNull);
      expect(scope.readCachedProfile(), isNull);
    });
  });

  group('ProfileScreen header', () {
    Future<void> pump(WidgetTester tester, FakeAuthNotifier auth, _ProfileRepo repo) async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(ProviderScope(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          authProvider.overrideWith((ref) => auth),
          profileRepositoryProvider.overrideWithValue(repo),
        ],
        child: const MaterialApp(home: ProfileScreen()),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('shows the edited name without a reload, then the new photo', (tester) async {
      final auth = FakeAuthNotifier()..signIn('A', profile: {'firstName': 'Aline', 'lastName': 'K.'});
      final repo = _ProfileRepo(const BuyerProfile(id: 'A', firstName: 'Aline', lastName: 'K.', role: 'BUYER'));
      await pump(tester, auth, repo);
      expect(find.text('Aline K.'), findsOneWidget);
      expect(find.byKey(const ValueKey('complete-profile-nudge')), findsNothing);

      // What personal_info_screen does after PATCH /v1/users/profile.
      await auth.updateUser({'firstName': 'Amina', 'lastName': 'Kabila'});
      await tester.pumpAndSettle();
      expect(find.text('Amina Kabila'), findsOneWidget);
      expect(find.text('Aline K.'), findsNothing);
      expect(find.text('AK'), findsOneWidget, reason: 'initials follow the name');
    });

    testWidgets('a nameless buyer gets the one-line nudge (not a fake name, not a blocker)', (tester) async {
      final auth = FakeAuthNotifier()..signIn('A', profile: {'phone': '+243999000101'});
      final repo = _ProfileRepo(const BuyerProfile(id: 'A', phone: '+243999000101', role: 'BUYER'));
      await pump(tester, auth, repo);
      expect(find.text('Compte Teka'), findsOneWidget);
      expect(find.byKey(const ValueKey('complete-profile-nudge')), findsOneWidget);
      expect(find.text('Mes commandes'), findsOneWidget, reason: 'the rest of the account stays usable');

      await auth.updateUser({'firstName': 'Amina'});
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('complete-profile-nudge')), findsNothing);
      expect(find.text('Amina'), findsOneWidget);
    });
  });
}
